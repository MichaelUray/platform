<!--
// Copyright © 2023 Hardcore Engineering Inc.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
-->
<script lang="ts">
  import { Analytics } from '@hcengineering/analytics'
  import type { Class, Doc, Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import tags, { TagsEvents } from '@hcengineering/tags'
  import type { TagElement } from '@hcengineering/tags'
  import { getObjectId } from '@hcengineering/view-resources'
  import { addTagReference } from '../tag-reference'
  import TagsPopup from './TagsPopup.svelte'

  export let object: Doc
  export let targetClass: Ref<Class<Doc>> = object._class

  let selected: Ref<TagElement>[] = []
  const query = createQuery()
  $: query.query(
    tags.class.TagReference,
    { attachedTo: object._id, attachedToClass: object._class, collection: 'labels' },
    (result) => {
      selected = result.map(({ tag }) => tag)
    }
  )
  const client = getClient()
  const hierarchy = client.getHierarchy()
  async function addRef (tag: TagElement): Promise<void> {
    if (!(await addTagReference(client, object, tag))) return

    if (!selected.includes(tag._id)) selected = [...selected, tag._id]
    const id = await getObjectId(object, hierarchy)
    Analytics.handleEvent(TagsEvents.TagCreated, { objectId: id, objectClass: object._class })
  }

  async function removeTag (tag: TagElement): Promise<void> {
    const tagRef = await client.findOne(tags.class.TagReference, {
      tag: tag._id,
      attachedTo: object._id,
      attachedToClass: object._class,
      collection: 'labels'
    })
    if (tagRef) {
      await client.remove(tagRef)
      selected = selected.filter((id) => id !== tag._id)
      const id = await getObjectId(object, hierarchy)
      Analytics.handleEvent(TagsEvents.TagRemoved, { objectId: id, objectClass: object._class })
    }
  }

  function onUpdate (event: CustomEvent<{ action: string, tag: TagElement }>): void {
    const result = event.detail
    if (result === undefined) return
    const operation = result.action === 'add' ? addRef : result.action === 'remove' ? removeTag : undefined
    if (operation !== undefined) {
      void operation(result.tag).catch((error: unknown) => {
        Analytics.handleError(error instanceof Error ? error : new Error(String(error)))
      })
    }
  }
</script>

<TagsPopup {targetClass} {selected} on:update={onUpdate} />
