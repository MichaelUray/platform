// SPDX-License-Identifier: EPL-2.0

import type { Class, Doc, Ref, TxOperations } from '@hcengineering/core'
import tags from '@hcengineering/tags'
import type { TagElement, TagReference } from '@hcengineering/tags'

// Editors share reservations through the stable clientProxy identity returned by getClient().
const pendingReferences = new WeakMap<
  Pick<TxOperations, 'findAll' | 'addCollection'>,
  Map<Ref<Doc>, Array<Pick<TagReference, 'tag' | 'attachedToClass' | 'collection'>>>
>()

/** Check tag identity within an editor's references or draft. */
export function hasTagReference (
  references: ReadonlyArray<Pick<TagReference, 'tag'>>,
  tag: Pick<TagElement, '_id'>
): boolean {
  return references.some((ref) => ref.tag === tag._id)
}

/**
 * Add a label once, including while another editor is still attaching it.
 * Duplicates silently return false. An in-flight duplicate does not wait for the original
 * caller's result or retry if that caller fails; the original caller handles the error.
 */
export async function addTagReference (
  client: Pick<TxOperations, 'findAll' | 'addCollection'>,
  object: Pick<Doc, '_id' | '_class' | 'space'>,
  tag: TagElement,
  collection = 'labels',
  attachedToClass: Ref<Class<Doc>> = object._class
): Promise<boolean> {
  let documents = pendingReferences.get(client)
  if (documents === undefined) {
    documents = new Map()
    pendingReferences.set(client, documents)
  }
  const pending = documents.get(object._id) ?? []
  if (
    pending.some(
      (ref) => ref.tag === tag._id && ref.attachedToClass === attachedToClass && ref.collection === collection
    )
  ) {
    return false
  }

  const reference = { tag: tag._id, attachedToClass, collection }
  pending.push(reference)
  documents.set(object._id, pending)
  try {
    const existing = await client.findAll(tags.class.TagReference, {
      attachedTo: object._id,
      attachedToClass,
      collection,
      tag: tag._id
    })
    if (hasTagReference(existing, tag)) return false

    await client.addCollection(tags.class.TagReference, object.space, object._id, attachedToClass, collection, {
      tag: tag._id,
      title: tag.title,
      color: tag.color
    })
    return true
  } finally {
    pending.splice(pending.indexOf(reference), 1)
    if (pending.length === 0) documents.delete(object._id)
  }
}
