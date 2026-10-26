<!-- SPDX-License-Identifier: EPL-2.0 -->
<script lang="ts">
  import type { TagReference } from '@hcengineering/tags'
  import { createEventDispatcher } from 'svelte'

  export let key: unknown
  export let readonly: boolean
  export let targetClass: string
  export let items: TagReference[] = []

  const dispatch = createEventDispatcher()
  const tag = { _id: 'tag', title: 'Bug', color: 1 }
</script>

<div data-key={JSON.stringify(key)} data-readonly={readonly} data-target-class={targetClass}>
  {#each items as item}
    <span data-reference={item._id}>{item.title}</span>
  {/each}
  <button on:click={() => dispatch('open', tag)}>Add</button>
  <button on:click={() => dispatch('delete', items[0]._id)}>Remove</button>
  <button on:click={() => dispatch('change', { tag: items[0], weight: 6 })}>Weight</button>
</div>
