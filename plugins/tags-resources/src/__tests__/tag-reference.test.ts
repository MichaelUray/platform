// SPDX-License-Identifier: EPL-2.0

import type { Class, Doc, Ref, Space } from '@hcengineering/core'
import type { TagElement, TagReference } from '@hcengineering/tags'
import { addTagReference, hasTagReference } from '../tag-reference'
import { deferred } from './deferred'

jest.mock(
  '@hcengineering/tags',
  () => ({ __esModule: true, default: { class: { TagReference: 'tags:class:TagReference' } } }),
  { virtual: true }
)

const object = {
  _id: 'document' as Ref<Doc>,
  _class: 'test:class:Document' as Ref<Class<Doc>>,
  space: 'space' as Ref<Space>
}
const tag = { _id: 'tag' as Ref<TagElement>, title: 'Bug', color: 1 } as unknown as TagElement
const candidateClass = 'test:mixin:Candidate' as Ref<Class<Doc>>
const scopes = [
  { collection: 'labels', attachedToClass: candidateClass },
  { collection: 'skills', attachedToClass: object._class }
]

interface MockClient {
  findAll: jest.Mock
  addCollection: jest.Mock
}

function createClient (): MockClient {
  return {
    findAll: jest.fn().mockResolvedValue([]),
    addCollection: jest.fn().mockResolvedValue('reference')
  }
}

describe('hasTagReference', () => {
  it('recognizes the same tag even if its cached title differs', () => {
    const references = [{ tag: tag._id, title: 'Old title' }]
    expect(hasTagReference(references, tag)).toBe(true)
  })

  it.each(['Bug', ' BUG ', ''])('allows distinct tag IDs with title %p', (title) => {
    const references = [{ tag: 'other' as Ref<TagElement>, title }]
    expect(hasTagReference(references, tag)).toBe(false)
  })
})

describe('addTagReference', () => {
  it('checks persisted references rather than the editor selection', async () => {
    const client = createClient()
    client.findAll.mockResolvedValue([{ tag: tag._id, title: tag.title }])

    expect(await addTagReference(client, object, tag)).toBe(false)
    expect(client.findAll).toHaveBeenCalledWith('tags:class:TagReference', {
      attachedTo: object._id,
      attachedToClass: object._class,
      collection: 'labels',
      tag: tag._id
    })
    expect(client.addCollection).not.toHaveBeenCalled()
  })

  it('allows a different tag with the same stored title', async () => {
    const client = createClient()
    client.findAll.mockResolvedValue([{ tag: 'other', title: ' BUG ' }])

    expect(await addTagReference(client, object, tag)).toBe(true)
    expect(client.addCollection).toHaveBeenCalledTimes(1)
  })

  it.each([tag, { ...tag, title: 'Renamed label' }])(
    'blocks concurrent adds of the same tag from separate editors: %o',
    async (duplicate) => {
      const client = createClient()
      const started = deferred<void>()
      const finish = deferred<void>()
      client.addCollection.mockImplementationOnce(async () => {
        started.resolve()
        await finish.promise
        return 'reference'
      })
      const first = addTagReference(client, object, tag)
      await started.promise

      expect(await addTagReference(client, object, duplicate)).toBe(false)
      finish.resolve()
      expect(await first).toBe(true)
      expect(client.addCollection).toHaveBeenCalledTimes(1)
    }
  )

  it.each(scopes)('allows an existing reference in another scope: %o', async (scope) => {
    const client = createClient()
    const reference = { attachedTo: object._id, tag: tag._id, ...scope }
    client.findAll.mockImplementation(async (_class, query: Partial<TagReference>) => {
      return [reference].filter(
        (ref) =>
          ref.attachedTo === query.attachedTo &&
          ref.attachedToClass === query.attachedToClass &&
          ref.collection === query.collection &&
          ref.tag === query.tag
      )
    })

    expect(await addTagReference(client, object, tag)).toBe(true)
    expect(client.addCollection).toHaveBeenCalledTimes(1)
  })

  it.each(scopes)('allows concurrent adds in different scopes: %o', async (scope) => {
    const client = createClient()
    const started = deferred<void>()
    const finish = deferred<void>()
    client.addCollection.mockImplementationOnce(async () => {
      started.resolve()
      await finish.promise
      return 'reference'
    })
    const first = addTagReference(client, object, tag)
    await started.promise

    expect(await addTagReference(client, object, tag, scope.collection, scope.attachedToClass)).toBe(true)
    finish.resolve()
    expect(await first).toBe(true)
    expect(client.addCollection).toHaveBeenCalledTimes(2)
  })

  it('allows concurrent adds of different tags with the same title', async () => {
    const client = createClient()
    const other = { ...tag, _id: 'other' as Ref<TagElement> }

    expect(await Promise.all([addTagReference(client, object, tag), addTagReference(client, object, other)])).toEqual([
      true,
      true
    ])
    expect(client.addCollection).toHaveBeenCalledTimes(2)
  })

  it('allows the same tag on different documents during a bulk add', async () => {
    const client = createClient()
    const other = { ...object, _id: 'other-document' as Ref<Doc> }

    expect(await Promise.all([addTagReference(client, object, tag), addTagReference(client, other, tag)])).toEqual([
      true,
      true
    ])
    expect(client.addCollection).toHaveBeenCalledTimes(2)
  })

  it('preserves the target class, collection and label data', async () => {
    const client = createClient()
    expect(await addTagReference(client, object, tag, 'skills', candidateClass)).toBe(true)
    expect(client.findAll).toHaveBeenCalledWith('tags:class:TagReference', {
      attachedTo: object._id,
      attachedToClass: candidateClass,
      collection: 'skills',
      tag: tag._id
    })
    expect(client.addCollection).toHaveBeenCalledWith(
      'tags:class:TagReference',
      object.space,
      object._id,
      candidateClass,
      'skills',
      { tag: tag._id, title: tag.title, color: tag.color }
    )
  })

  it.each(['findAll', 'addCollection'] as const)('allows retry after %s fails', async (operation) => {
    const client = createClient()
    const error = new Error('Offline')
    client[operation].mockRejectedValueOnce(error)

    await expect(addTagReference(client, object, tag)).rejects.toThrow(error)
    expect(await addTagReference(client, object, tag)).toBe(true)
  })

  it('blocks duplicates while the persisted lookup is still pending', async () => {
    const client = createClient()
    const lookup = deferred<never[]>()
    client.findAll.mockReturnValueOnce(lookup.promise)
    const first = addTagReference(client, object, tag)

    expect(await addTagReference(client, object, tag)).toBe(false)
    expect(client.findAll).toHaveBeenCalledTimes(1)
    expect(client.addCollection).not.toHaveBeenCalled()
    lookup.resolve([])
    expect(await first).toBe(true)
    expect(client.addCollection).toHaveBeenCalledTimes(1)
  })

  it('leaves failure handling to the original caller and permits a later retry', async () => {
    const client = createClient()
    const started = deferred<void>()
    const finish = deferred<void>()
    const error = new Error('Offline')
    client.addCollection.mockImplementationOnce(async () => {
      started.resolve()
      await finish.promise
      return 'reference'
    })
    const first = addTagReference(client, object, tag)
    const failure = expect(first).rejects.toThrow(error)
    await started.promise

    expect(await addTagReference(client, object, tag)).toBe(false)
    finish.reject(error)
    await failure
    expect(await addTagReference(client, object, tag)).toBe(true)
    expect(client.addCollection).toHaveBeenCalledTimes(2)
  })

  it('keeps reservations isolated between clients', async () => {
    const client = createClient()
    const otherClient = createClient()
    const started = deferred<void>()
    const finish = deferred<void>()
    client.addCollection.mockImplementationOnce(async () => {
      started.resolve()
      await finish.promise
      return 'reference'
    })
    const first = addTagReference(client, object, tag)
    await started.promise

    expect(await addTagReference(otherClient, object, tag)).toBe(true)
    finish.resolve()
    expect(await first).toBe(true)
    expect(client.addCollection).toHaveBeenCalledTimes(1)
    expect(otherClient.addCollection).toHaveBeenCalledTimes(1)
  })

  it('allows reattaching a removed label', async () => {
    const client = createClient()
    client.findAll.mockResolvedValueOnce([{ tag: tag._id, title: tag.title }])

    expect(await addTagReference(client, object, tag)).toBe(false)
    expect(await addTagReference(client, object, tag)).toBe(true)
    expect(client.addCollection).toHaveBeenCalledTimes(1)
  })
})
