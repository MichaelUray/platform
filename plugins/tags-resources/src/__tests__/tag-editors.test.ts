/**
 * @jest-environment jsdom
 */
// SPDX-License-Identifier: EPL-2.0

import { Analytics } from '@hcengineering/analytics'
import type { Class, Doc, PersonId, Ref, Space } from '@hcengineering/core'
import { createQuery, getClient } from '@hcengineering/presentation'
import type { KeyedAttribute } from '@hcengineering/presentation'
import tags, { TagsEvents } from '@hcengineering/tags'
import type { TagElement, TagReference } from '@hcengineering/tags'
import { getObjectId } from '@hcengineering/view-resources'
import { SvelteComponent, tick } from 'svelte'
import ObjectsTagsEditorPopup from '../components/ObjectsTagsEditorPopup.svelte'
import Tags from '../components/Tags.svelte'
import TagsEditorPopup from '../components/TagsEditorPopup.svelte'

jest.mock('@hcengineering/analytics', () => ({ Analytics: { handleError: jest.fn(), handleEvent: jest.fn() } }))
jest.mock('@hcengineering/presentation', () => ({ createQuery: jest.fn(), getClient: jest.fn() }))
jest.mock('@hcengineering/view-resources', () => ({ getObjectId: jest.fn() }))
jest.mock('@hcengineering/tags', () => ({
  __esModule: true,
  default: { class: { TagReference: 'tags:class:TagReference' } },
  TagsEvents: { TagCreated: 'tag-created', TagRemoved: 'tag-removed' }
}))
jest.mock('../plugin', () => ({ __esModule: true, default: { class: { TagReference: 'tags:class:TagReference' } } }))

const object: Doc = {
  _id: 'document' as Ref<Doc>,
  _class: 'test:class:Document' as Ref<Class<Doc>>,
  space: 'space' as Ref<Space>,
  modifiedBy: 'account' as PersonId,
  modifiedOn: 0
}
const otherObject: Doc = {
  ...object,
  _id: 'other-document' as Ref<Doc>,
  _class: 'test:class:OtherDocument' as Ref<Class<Doc>>
}
const targetClass = 'test:mixin:TagTarget' as Ref<Class<Doc>>
const handleError = jest.spyOn(Analytics, 'handleError')
const handleEvent = jest.spyOn(Analytics, 'handleEvent')

interface ReferenceQuery {
  attachedTo?: string | { $in: string[] }
  attachedToClass?: string | { $in: string[] }
  collection?: string
  tag?: Ref<TagElement>
}

function matchesField (value: string, query: string | { $in: string[] } | undefined): boolean {
  return query === undefined || (typeof query === 'string' ? value === query : query.$in.includes(value))
}

function matchesReference (reference: TagReference, query: ReferenceQuery): boolean {
  return (
    matchesField(reference.attachedTo, query.attachedTo) &&
    matchesField(reference.attachedToClass, query.attachedToClass) &&
    matchesField(reference.collection, query.collection) &&
    matchesField(reference.tag, query.tag)
  )
}

function createReference (overrides: Partial<TagReference> = {}): TagReference {
  return {
    ...object,
    _id: 'reference' as Ref<TagReference>,
    _class: tags.class.TagReference,
    attachedTo: object._id,
    attachedToClass: object._class,
    collection: 'labels',
    tag: 'tag' as Ref<TagElement>,
    title: 'Bug',
    color: 1,
    ...overrides
  }
}

let references: TagReference[] = []
const query = jest.fn((_class: string, scope: ReferenceQuery, callback: (result: TagReference[]) => void) => {
  callback(references.filter((reference) => matchesReference(reference, scope)))
  return true
})
const findAll = jest.fn(async (_class: string, scope: ReferenceQuery) => {
  return references.filter((reference) => matchesReference(reference, scope))
})
const findOne = jest.fn(async (_class: string, scope: ReferenceQuery) => {
  return references.find((reference) => matchesReference(reference, scope))
})
const remove = jest.fn(async (removed: TagReference) => {
  references = references.filter((reference) => reference._id !== removed._id)
})
const addCollection = jest.fn().mockResolvedValue('new-reference')
const removeCollection = jest.fn().mockResolvedValue(undefined)
const update = jest.fn().mockResolvedValue(undefined)
const client = {
  findAll,
  findOne,
  remove,
  addCollection,
  removeCollection,
  update,
  getHierarchy: jest.fn().mockReturnValue({})
}
let component: SvelteComponent | undefined

function mountPopup (mode: 'single' | 'bulk'): void {
  component =
    mode === 'single'
      ? new TagsEditorPopup({ target: document.body, props: { object, targetClass } })
      : new ObjectsTagsEditorPopup({ target: document.body, props: { value: [object, otherObject] } })
}

function selected (): string | null {
  const popup = document.querySelector('[data-selected]')
  if (popup === null) throw new Error('Missing popup')
  return popup.getAttribute('data-selected')
}

function click (label: string): void {
  const button = Array.from(document.querySelectorAll('button')).find((element) => element.textContent === label)
  if (button === undefined) throw new Error(`Missing ${label} button`)
  button.click()
}

async function flushUpdates (): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
  await tick()
}

beforeEach(() => {
  jest.clearAllMocks()
  references = []
  jest.mocked(getClient).mockReturnValue(client as unknown as ReturnType<typeof getClient>)
  const liveQuery = { query }
  jest.mocked(createQuery).mockReturnValue(liveQuery as unknown as ReturnType<typeof createQuery>)
  jest.mocked(getObjectId).mockResolvedValue('document-id')
})

afterEach(() => {
  component?.$destroy()
  component = undefined
  document.body.replaceChildren()
})

describe.each(['single', 'bulk'] as const)('%s tag popup', (mode) => {
  it('does not select a tag attached only in another collection or class', () => {
    references = [
      createReference({ collection: 'skills' }),
      createReference({ attachedToClass: targetClass }),
      createReference({ attachedTo: otherObject._id, attachedToClass: otherObject._class, collection: 'skills' })
    ]
    mountPopup(mode)

    expect(selected()).toBe('')
    expect(query).toHaveBeenCalledWith(
      tags.class.TagReference,
      mode === 'single'
        ? { attachedTo: object._id, attachedToClass: object._class, collection: 'labels' }
        : {
            attachedTo: { $in: [object._id, otherObject._id] },
            attachedToClass: { $in: [object._class, otherObject._class] },
            collection: 'labels'
          },
      expect.any(Function)
    )
  })

  it('selects labels present on every document in its own scope', () => {
    references = [
      createReference(),
      createReference({ attachedTo: otherObject._id, attachedToClass: otherObject._class })
    ]
    mountPopup(mode)

    expect(selected()).toBe('tag')
  })

  it('removes only the label reference in each document scope', async () => {
    const wrongCollection = createReference({ _id: 'skill' as Ref<TagReference>, collection: 'skills' })
    const wrongClass = createReference({ _id: 'mixin' as Ref<TagReference>, attachedToClass: targetClass })
    const label = createReference()
    const otherLabel = createReference({
      _id: 'other-label' as Ref<TagReference>,
      attachedTo: otherObject._id,
      attachedToClass: otherObject._class
    })
    references = [wrongCollection, wrongClass, label, otherLabel]
    mountPopup(mode)
    click('Remove')
    await flushUpdates()

    expect(findOne).toHaveBeenCalledWith(tags.class.TagReference, {
      attachedTo: object._id,
      attachedToClass: object._class,
      collection: 'labels',
      tag: 'tag'
    })
    expect(remove).toHaveBeenCalledWith(label)
    expect(references).toContain(wrongCollection)
    expect(references).toContain(wrongClass)
    if (mode === 'bulk') {
      expect(findOne).toHaveBeenCalledWith(tags.class.TagReference, {
        attachedTo: otherObject._id,
        attachedToClass: otherObject._class,
        collection: 'labels',
        tag: 'tag'
      })
      expect(remove).toHaveBeenCalledWith(otherLabel)
      expect(remove).toHaveBeenCalledTimes(2)
    } else {
      expect(remove).toHaveBeenCalledTimes(1)
      expect(selected()).toBe('')
      expect(handleEvent).toHaveBeenCalledWith(TagsEvents.TagRemoved, {
        objectId: 'document-id',
        objectClass: object._class
      })
    }
  })

  it('does not remove a reference found only in another scope', async () => {
    references = [createReference({ collection: 'skills' }), createReference({ attachedToClass: targetClass })]
    mountPopup(mode)
    click('Remove')
    await flushUpdates()

    expect(remove).not.toHaveBeenCalled()
    expect(handleEvent).not.toHaveBeenCalled()
    expect(references).toHaveLength(2)
  })

  it('checks persisted labels when the popup selection is stale', async () => {
    mountPopup(mode)
    expect(selected()).toBe('')
    references = [createReference()]
    click('Add')
    await flushUpdates()

    expect(findAll).toHaveBeenCalledWith(tags.class.TagReference, {
      attachedTo: object._id,
      attachedToClass: object._class,
      collection: 'labels',
      tag: 'tag'
    })
    expect(addCollection).toHaveBeenCalledTimes(mode === 'bulk' ? 1 : 0)
    expect(handleEvent).not.toHaveBeenCalled()
  })

  it('adds labels in each document scope while preserving other scopes', async () => {
    const skill = createReference({ collection: 'skills' })
    references = [skill]
    mountPopup(mode)
    click('Add')
    await flushUpdates()

    expect(addCollection).toHaveBeenCalledWith(
      tags.class.TagReference,
      object.space,
      object._id,
      object._class,
      'labels',
      { tag: 'tag', title: 'Bug', color: 1 }
    )
    expect(addCollection).toHaveBeenCalledTimes(mode === 'bulk' ? 2 : 1)
    expect(references).toContain(skill)
    if (mode === 'bulk') {
      expect(addCollection).toHaveBeenCalledWith(
        tags.class.TagReference,
        otherObject.space,
        otherObject._id,
        otherObject._class,
        'labels',
        { tag: 'tag', title: 'Bug', color: 1 }
      )
    } else {
      expect(selected()).toBe('tag')
      expect(handleEvent).toHaveBeenCalledWith(TagsEvents.TagCreated, {
        objectId: 'document-id',
        objectClass: object._class
      })
    }
  })

  it.each(['findAll', 'addCollection', 'findOne', 'remove'] as const)(
    'handles a rejected %s from an update event',
    async (operation) => {
      references = operation === 'remove' ? [createReference()] : []
      const error = new Error('Offline')
      client[operation].mockRejectedValueOnce(error)
      mountPopup(mode)
      click(operation === 'findAll' || operation === 'addCollection' ? 'Add' : 'Remove')
      await flushUpdates()

      expect(handleError).toHaveBeenCalledTimes(1)
      expect(handleError).toHaveBeenCalledWith(error)
      expect(handleEvent).not.toHaveBeenCalled()
      if (operation === 'findAll') {
        expect(addCollection).toHaveBeenCalledTimes(mode === 'bulk' ? 1 : 0)
      }
      click(operation === 'findAll' || operation === 'addCollection' ? 'Add' : 'Remove')
      await flushUpdates()
      expect(handleError).toHaveBeenCalledTimes(1)
      expect(client[operation]).toHaveBeenCalledTimes(operation === 'remove' || mode === 'single' ? 2 : 4)
    }
  )

  it('ignores selection-only events', async () => {
    mountPopup(mode)
    click('Selection')
    await flushUpdates()

    expect(findAll).not.toHaveBeenCalled()
    expect(findOne).not.toHaveBeenCalled()
    expect(handleError).not.toHaveBeenCalled()
  })

  it('normalizes non-Error rejections from update events', async () => {
    findAll.mockRejectedValueOnce('Offline')
    mountPopup(mode)
    click('Add')
    await flushUpdates()

    expect(handleError).toHaveBeenCalledTimes(1)
    expect(handleError).toHaveBeenCalledWith(new Error('Offline'))
  })
})

it('does not count duplicate or wrong-class references as labels on every document', async () => {
  references = [
    createReference(),
    createReference({ _id: 'duplicate' as Ref<TagReference> }),
    createReference({ attachedTo: otherObject._id, attachedToClass: object._class })
  ]
  mountPopup('bulk')
  expect(selected()).toBe('')

  references.push(createReference({ attachedTo: otherObject._id, attachedToClass: otherObject._class }))
  const lastQuery = query.mock.lastCall
  if (lastQuery === undefined) throw new Error('Missing live query')
  lastQuery[2](references.filter((reference) => matchesReference(reference, lastQuery[1])))
  await tick()
  expect(selected()).toBe('tag')
})

it('displays only the attribute collection in Tags', async () => {
  const label = createReference()
  const skill = createReference({ _id: 'skill' as Ref<TagReference>, collection: 'skills', title: 'TypeScript' })
  references = [label, skill, createReference({ attachedToClass: targetClass, title: 'Other class' })]
  const key = { key: 'labels', attr: {} } as unknown as KeyedAttribute
  component = new Tags({ target: document.body, props: { object, _class: object._class, key } })

  expect(query).toHaveBeenCalledWith(
    tags.class.TagReference,
    { attachedTo: object._id, attachedToClass: object._class, collection: 'labels' },
    expect.any(Function),
    { sort: { weight: -1, title: 1 } }
  )
  expect(document.querySelector('[data-reference]')?.textContent).toBe('Bug')
  expect(document.querySelectorAll('[data-reference]')).toHaveLength(1)

  component.$set({ key: { ...key, key: 'skills' } })
  await tick()
  expect(document.querySelector('[data-reference]')?.textContent).toBe('TypeScript')
  expect(document.querySelectorAll('[data-reference]')).toHaveLength(1)
})

it.each(['findAll', 'addCollection', 'removeCollection', 'update'] as const)(
  'handles a rejected %s in the Tags attribute editor',
  async (operation) => {
    references = [createReference({ tag: 'other-tag' as Ref<TagElement> })]
    const key = { key: 'labels', attr: {} } as unknown as KeyedAttribute
    const error = new Error('Offline')
    client[operation].mockRejectedValueOnce(error)
    component = new Tags({ target: document.body, props: { object, _class: object._class, key } })
    click(operation === 'update' ? 'Weight' : operation === 'removeCollection' ? 'Remove' : 'Add')
    await flushUpdates()

    expect(handleError).toHaveBeenCalledTimes(1)
    expect(handleError).toHaveBeenCalledWith(error)
    if (operation === 'findAll') expect(addCollection).not.toHaveBeenCalled()
  }
)
