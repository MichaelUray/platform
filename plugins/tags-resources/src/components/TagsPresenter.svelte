<!--
// Copyright © 2022 Hardcore Engineering Inc.
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
  import { Class, Doc, Ref } from '@hcengineering/core'
  import { Asset } from '@hcengineering/platform'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { AnySvelteComponent, Icon, tooltip } from '@hcengineering/ui'
  import tagsId from '../plugin'
  import TagsPresentationPopup from './TagsPresentationPopup.svelte'

  export let value: Doc
  export let _class: Ref<Class<Doc>>
  export let key: string
  export let icon: Asset | AnySvelteComponent = tagsId.icon.Tags

  const client = getClient()
  const query = createQuery()
  let tags = 0

  $: attr = client.getHierarchy().getAttribute(_class, key)
  $: query.query(
    tagsId.class.TagReference,
    { attachedTo: value._id, attachedToClass: _class, collection: key },
    (references) => {
      tags = references.length
    }
  )
</script>

{#if tags > 0}
  <div
    use:tooltip={{
      label: attr.label,
      component: TagsPresentationPopup,
      props: { object: value, _class, key: { key, attr } }
    }}
    class="sm-tool-icon"
  >
    <span class="icon"><Icon {icon} size="small" /></span>&nbsp;{tags}
  </div>
{/if}
