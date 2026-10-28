<!-- SPDX-License-Identifier: EPL-2.0 -->
<script lang="ts">
  import type { Attrs } from '@hcengineering/text'
  import type { Blob, Ref } from '@hcengineering/core'
  import { getFileUrl, getPlatformFileId } from '../../file'
  import { getSrcSet } from '../../preview'

  export let attrs: Attrs
  export let compact = false

  function resolveImage(attrs: Attrs, compact: boolean): { src?: string, srcset?: string } {
    const source = attrs.src != null && attrs.src !== '' ? String(attrs.src) : undefined
    const fileId =
      attrs['file-id'] != null && attrs['file-id'] !== '' ? String(attrs['file-id']) : getPlatformFileId(source ?? '')
    if (fileId === undefined) return { src: source }

    try {
      return {
        src: getFileUrl(fileId),
        srcset: compact ? getSrcSet(fileId as Ref<Blob>, 32, 32) : undefined
      }
    } catch {
      // Viewers also run before file storage is configured (e.g. standalone HTML previews).
      return { src: source }
    }
  }

  $: image = resolveImage(attrs, compact)
  $: alt = attrs.alt != null ? String(attrs.alt) : undefined
  $: width = attrs.width != null ? String(attrs.width) : undefined
  $: height = attrs.height != null ? String(attrs.height) : undefined
</script>

<img src={image.src} srcset={image.srcset} {alt} {width} {height} />
