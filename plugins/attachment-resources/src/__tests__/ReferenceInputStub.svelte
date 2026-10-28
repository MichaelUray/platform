<!-- SPDX-License-Identifier: EPL-2.0 -->
<script lang="ts">
  import { inserted } from './inline-image-fixture'
  export let content = ''
  export let loading = false
  export let onPaste: (view: unknown, event: ClipboardEvent) => boolean

  export function insertMarkup(markup: string): void {
    inserted.push(markup)
  }
</script>

<!-- Only the nested editor is stubbed; the parent owns the production paste/upload/insert flow. -->
<div on:paste={(event) => onPaste({}, event)}>
  <textarea disabled={loading} value={content} />
  <slot name="header" />
</div>
