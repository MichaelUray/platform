// SPDX-License-Identifier: EPL-2.0

import { MarkupMarkType, MarkupNodeType } from '@hcengineering/text-core'
import type { MarkupMark, MarkupNode } from '@hcengineering/text-core'
import { MarkdownState, markdownToMarkup, markupToMarkdown } from '..'

function inlineCode (text: string): MarkupNode {
  return {
    type: MarkupNodeType.doc,
    content: [
      {
        type: MarkupNodeType.paragraph,
        content: [{ type: MarkupNodeType.text, text, marks: [{ type: MarkupMarkType.code, attrs: {} }] }]
      }
    ]
  }
}

describe('inline code delimiters', () => {
  it.each([
    ['plain', '`plain`'],
    ['a`b', '``a`b``'],
    ['a``b`c', '```a``b`c```'],
    ['`ls`', '`` `ls` ``'],
    ['`start', '`` `start ``'],
    ['end`', '`` end` ``'],
    ['``', '``` `` ```'],
    [' leading', '` leading`'],
    ['trailing ', '`trailing `'],
    [' both ', '`  both  `'],
    ['  both  ', '`   both   `'],
    [' ', '` `'],
    ['  ', '`  `']
  ])('preserves %j', (text, expectedMarkdown) => {
    const markup = inlineCode(text)
    const markdown = markupToMarkdown(markup)

    expect(markdown).toBe(expectedMarkdown)
    expect(markdownToMarkup(markdown)).toEqual(markup)
  })

  it('uses one delimiter pair for adjacent text nodes with the same code mark', () => {
    const markup = inlineCode('`a``b ')
    const content = markup.content?.[0].content
    content?.splice(
      0,
      1,
      ...['`a`', '`b '].map((text) => ({
        type: MarkupNodeType.text,
        text,
        marks: [{ type: MarkupMarkType.code, attrs: {} }]
      }))
    )

    const markdown = markupToMarkdown(markup)

    expect(markdown).toBe('``` `a``b  ```')
    expect(markdownToMarkup(markdown)).toEqual(inlineCode('`a``b '))
    expect(content).toHaveLength(2)
  })

  const code: MarkupMark = { type: MarkupMarkType.code, attrs: {} }
  const bold: MarkupMark = { type: MarkupMarkType.bold }
  const link: MarkupMark = { type: MarkupMarkType.link, attrs: { href: 'https://example.com' } }
  const codeRuns: Array<{
    name: string
    nodes: Array<{ text: string, marks: MarkupMark[] }>
    fence: string
    padding: string
  }> = [
    {
      name: 'the reviewer example with partial bold',
      nodes: [{ text: 'a`b', marks: [code, bold] }, { text: 'c', marks: [code] }],
      fence: '``',
      padding: ''
    },
    {
      name: 'a link inside code',
      nodes: [{ text: 'a``b', marks: [code, link] }, { text: 'c', marks: [code] }],
      fence: '```',
      padding: ''
    },
    {
      name: 'three nodes with mixed marks and backticks in the middle',
      nodes: [
        { text: 'a', marks: [code, bold] },
        { text: 'b```c', marks: [code, link] },
        { text: 'd', marks: [code] }
      ],
      fence: '````',
      padding: ''
    },
    {
      name: 'backticks only in the last node',
      nodes: [{ text: 'a', marks: [code, bold] }, { text: 'b``c', marks: [code] }],
      fence: '```',
      padding: ''
    },
    {
      name: 'a leading backtick needing padding on both sides',
      nodes: [{ text: '`a', marks: [code, bold] }, { text: 'b', marks: [code] }],
      fence: '``',
      padding: ' '
    },
    {
      name: 'a trailing backtick needing padding on both sides',
      nodes: [{ text: 'a', marks: [code, link] }, { text: 'b`', marks: [code] }],
      fence: '``',
      padding: ' '
    },
    {
      name: 'a backtick run crossing a node boundary',
      nodes: [{ text: 'a``', marks: [code, bold] }, { text: '`b', marks: [code] }],
      fence: '````',
      padding: ''
    },
    {
      name: 'spaces at both ends of the whole run',
      nodes: [{ text: ' a', marks: [code, link] }, { text: 'b ', marks: [code] }],
      fence: '`',
      padding: ' '
    }
  ]

  it.each(codeRuns)('uses the whole contiguous run for $name', ({ nodes, fence, padding }) => {
    const content: MarkupNode[] = nodes.map((node) => ({ type: MarkupNodeType.text, ...node }))
    const parent: MarkupNode = { type: MarkupNodeType.paragraph, content }
    const original = JSON.stringify(parent)
    const state = new MarkdownState()

    for (let index = 0; index < content.length; index++) {
      expect(state.markString(code, true, parent, index)).toBe(fence + padding)
      expect(state.markString(code, false, parent, index + 1)).toBe(padding + fence)
    }
    expect(JSON.stringify(parent)).toBe(original)
  })

  it('limits code fences and padding to the current contiguous run', () => {
    const parent: MarkupNode = {
      type: MarkupNodeType.paragraph,
      content: [
        { type: MarkupNodeType.text, text: '`a````', marks: [code, bold] },
        { type: MarkupNodeType.text, text: ' between ', marks: [] },
        { type: MarkupNodeType.text, text: 'b`c', marks: [code, link] },
        { type: MarkupNodeType.text, text: 'd', marks: [code] },
        { type: MarkupNodeType.text, text: ' after`````', marks: [] }
      ]
    }
    const state = new MarkdownState()

    expect(state.markString(code, true, parent, 2)).toBe('``')
    expect(state.markString(code, false, parent, 4)).toBe('``')
  })

  it('closes code delimiters before unmarked text', () => {
    const markup = inlineCode('a`b')
    markup.content?.[0].content?.push({ type: MarkupNodeType.text, text: ' after', marks: [] })

    const markdown = markupToMarkdown(markup)

    expect(markdown).toBe('``a`b`` after')
    expect(markdownToMarkup(markdown)).toEqual(markup)
  })
})

describe.each([MarkupNodeType.code_block, MarkupNodeType.mermaid])('%s fences', (type) => {
  it.each([
    ['plain code', 3],
    ['before\n```\nafter', 4],
    ['before\n`````\nafter', 6],
    ['before\n   ````\nafter', 5]
  ])('preserves %j', (text, fenceLength) => {
    const language = type === MarkupNodeType.mermaid ? 'mermaid' : 'typescript'
    const markup: MarkupNode = {
      type: MarkupNodeType.doc,
      content: [
        {
          type,
          attrs: { language },
          content: [{ type: MarkupNodeType.text, text, marks: [] }]
        }
      ]
    }
    const markdown = markupToMarkdown(markup)
    const fence = '`'.repeat(fenceLength)

    expect(markdown).toBe(fence + language + '\n' + text + '\n' + fence)
    expect(markdownToMarkup(markdown)).toEqual(markup)
  })
})
