// SPDX-License-Identifier: EPL-2.0

import { getInlineImageFiles } from '../attachment-files'

test('collects nested inline image file-ids once, ignoring external images, GIFs and file nodes', () => {
  const content = JSON.stringify({
    type: 'doc',
    content: [
      {
        type: 'table',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'image', attrs: { 'file-id': 'inline' } },
              { type: 'image', attrs: { 'file-id': 'inline' } },
              { type: 'image', attrs: { src: 'https://example.com/image.png' } },
              { type: 'file', attrs: { 'file-id': 'document' } },
              { type: 'gif', attrs: { 'file-id': 'gif' } }
            ]
          }
        ]
      }
    ]
  })
  expect([...getInlineImageFiles(content)]).toEqual(['inline'])
})

test('accepts empty content', () => {
  expect([...getInlineImageFiles('')]).toEqual([])
})
