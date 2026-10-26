/** @jest-environment jsdom */
// SPDX-License-Identifier: EPL-2.0

import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { compile } from 'svelte/compiler'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'

interface MountedComponent {
  $destroy: () => void
  $on: (event: string, callback: (event: CustomEvent) => void) => void
}

type ComponentConstructor = new (options: { target: HTMLElement, props?: Record<string, unknown> }) => MountedComponent

interface PreviewFixture {
  popup: MountedComponent
  actionHandler: MountedComponent
  modes: string[]
  actions: string[]
}

interface DrawingProps {
  drawingAvailable: boolean
  createDrawing: (data: unknown) => Promise<unknown>
  drawings?: unknown[]
}

interface PreviewOptions {
  omitTitle?: boolean
  drawingProps?: DrawingProps
}

// Load the browser runtime together with compiled components, without replacing
// their lifecycle, event forwarding, or ActionHandler's keyboard processing.
function createPreview (options: PreviewOptions = {}): PreviewFixture {
  const cache = new Map<string, { exports: Record<string, unknown> }>()
  const svelteRoot = dirname(require.resolve('svelte/package.json'))
  const components = resolve(__dirname, '../components')
  const ui = resolve(components, '../../../ui/src/components')
  const handler = resolve(components, '../../../../plugins/view-resources/src/components/ActionHandler.svelte')
  const modes: string[] = []
  const actions: string[] = []
  const compilerOptions = { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 }
  const mockedImports = [
    '../index',
    '../plugin',
    '..',
    '../actions',
    '../selection',
    '../utils',
    '../focus',
    '../tooltips'
  ]

  function load (filename: string): Record<string, unknown> {
    const cached = cache.get(filename)
    if (cached !== undefined) return cached.exports
    const module = { exports: {} }
    cache.set(filename, module)
    let source = readFileSync(filename, 'utf8')
    if (filename.endsWith('.svelte')) {
      source = source.replace(/<script lang="ts">([\s\S]*?)<\/script>/, (_, script: string) => {
        const result = transpileModule(script, {
          compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022, verbatimModuleSyntax: true }
        })
        return `<script>${result.outputText}</script>`
      })
      source = compile(source, { filename, generate: 'dom', css: 'external' }).js.code
    }
    const code = transpileModule(source, { compilerOptions }).outputText
    const localRequire = (id: string): unknown => {
      if (id === 'svelte' || id === 'svelte/internal' || id === 'svelte/store' || id === 'svelte/transition') {
        return load(resolve(svelteRoot, 'src/runtime', id === 'svelte' ? 'index.js' : `${id.slice(7)}/index.js`))
      }
      if (id.endsWith('/disclose-version')) return {}
      if (id === '../context') return load(resolve(components, '../context.ts'))
      if (id.startsWith('@hcengineering/') || mockedImports.includes(id)) return mocks
      if (id.endsWith('.svelte')) {
        if (['Modal', 'ButtonIcon', 'ButtonBase'].some((name) => id === `./${name}.svelte`)) {
          return load(resolve(ui, id))
        }
        if (id === './ActionContext.svelte') return load(resolve(components, id))
        return { default: slot }
      }
      return load(resolve(dirname(filename), id))
    }
    // Execute locally compiled modules in the same browser realm as the mounted components.
    // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval
    new Function('require', 'module', 'exports', code)(localRequire, module, module.exports)
    return module.exports
  }

  function createSlot (markup: string): ComponentConstructor {
    const slotCode = compile(markup, { generate: 'dom' }).js.code
    const slotModule: { exports: { default?: ComponentConstructor } } = { exports: {} }
    const slotRequire = (id: string): unknown => {
      return id.endsWith('/disclose-version') ? {} : load(resolve(svelteRoot, 'src/runtime/internal/index.js'))
    }
    // Execute the compiled slot with the same runtime as the components above.
    // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval
    new Function('require', 'module', 'exports', transpileModule(slotCode, { compilerOptions }).outputText)(
      slotRequire,
      slotModule,
      slotModule.exports
    )
    if (slotModule.exports.default === undefined) throw new Error('Missing compiled slot component')
    return slotModule.exports.default
  }

  const slot = createSlot('<slot name="beforeTitle"/><slot name="title"/><slot name="actions"/><slot/>')
  const modalWithoutTitle = createSlot('<slot name="beforeTitle"/><slot name="actions"/><slot/>')
  const { writable } = load(resolve(svelteRoot, 'src/runtime/store/index.js')) as {
    writable: (value: unknown) => unknown
  }
  const mocks = {
    default: { class: { TxRemoveDoc: 'remove' }, string: {}, extension: {} },
    Analytics: { handleError: jest.fn(), handleEvent: jest.fn() },
    SortingOrder: { Descending: -1 },
    generateId: () => 'preview',
    getEmbeddedLabel: (value: string) => value,
    tooltip: () => ({}),
    registerFocus: () => ({ idx: -1 }),
    addTxListener: () => {},
    getClient: () => ({}),
    reduceCalls: (fn: unknown) => fn,
    getSelection: () => [],
    getResource: async (action: string) => () => actions.push(action),
    getContextActionsSync: (_client: unknown, _docs: unknown, ctx: { mode: string }) => {
      modes.push(ctx.mode)
      return ctx.mode === 'browser'
        ? ['ArrowLeft', 'ArrowRight', 'Enter', ' '].map((key) => ({ _id: key, action: key, keyBinding: [key] }))
        : []
    },
    getObjectPreview: () => undefined,
    focusStore: writable({ focus: undefined }),
    selectionStore: writable({ docs: [] }),
    previewDocument: writable(undefined),
    restrictionStore: writable({ disableActions: false }),
    ComponentExtensions: slot,
    Button: slot,
    get Modal () {
      return options.omitTitle === true ? modalWithoutTitle : load(resolve(ui, 'Modal.svelte')).default
    },
    get ButtonIcon () {
      return load(resolve(ui, 'ButtonIcon.svelte')).default
    },
    get contextStore () {
      return load(resolve(components, '../context.ts')).contextStore
    }
  }
  const Handler = load(handler).default as ComponentConstructor
  const Preview = load(resolve(components, 'FilePreviewPopup.svelte')).default as ComponentConstructor
  const actionHandler = new Handler({ target: document.body })
  const popup = new Preview({
    target: document.body,
    props: {
      name: 'image.png',
      contentType: 'image/png',
      metadata: undefined,
      file: undefined,
      props: options.drawingProps
    }
  })
  return { popup, actionHandler, modes, actions }
}

describe('file preview keyboard focus', () => {
  let preview: ReturnType<typeof createPreview>

  afterEach(() => {
    preview?.popup.$destroy()
    preview?.actionHandler.$destroy()
    document.body.innerHTML = ''
    jest.restoreAllMocks()
  })

  async function press (key: string): Promise<void> {
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true }))
    await Promise.resolve()
  }

  it('focuses the existing title on open and handles both image arrows', async () => {
    const focus = jest.spyOn(HTMLElement.prototype, 'focus')
    preview = createPreview()
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(document.activeElement?.classList.contains('antiTitle')).toBe(true)
    expect(document.querySelector('.hulyModal-container')?.parentElement).toBe(document.body)
    await press('ArrowRight')
    await press('ArrowLeft')
    expect(preview.modes).toEqual(['browser'])
    expect(preview.actions).toEqual(['ArrowRight', 'ArrowLeft'])
  })

  it('restores browser navigation after maximizing and minimizing', async () => {
    preview = createPreview()
    const sizes: boolean[] = []
    preview.popup.$on('fullsize', (event) => sizes.push(event.detail))
    const toggle = document.querySelectorAll('button')[1]
    const focus = jest.spyOn(HTMLElement.prototype, 'focus')
    for (let i = 0; i < 2; i++) {
      toggle.focus()
      focus.mockClear()
      toggle.click()
      expect(focus).toHaveBeenCalledWith({ preventScroll: true })
      await press('ArrowRight')
      await press('ArrowLeft')
      expect(document.activeElement?.classList.contains('antiTitle')).toBe(true)
    }
    expect(sizes).toEqual([true, false])
    expect(preview.actions).toEqual(['ArrowRight', 'ArrowLeft', 'ArrowRight', 'ArrowLeft'])
  })

  it('preserves input mode for focused buttons, including after arrow navigation', async () => {
    preview = createPreview()
    await press('ArrowRight')
    const close = document.querySelector('button')
    close?.focus()
    await press('Enter')
    await press(' ')
    await press('ArrowRight')
    await press('ArrowLeft')
    expect(preview.modes).toEqual(['browser', 'input'])
    expect(preview.actions).toEqual(['ArrowRight'])
    expect(document.activeElement).toBe(close)
  })

  it('initializes drawing support and handles both size changes without a title slot', async () => {
    const drawing = { _id: 'drawing' }
    const createDrawing = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(drawing)
    const drawingProps: DrawingProps = { drawingAvailable: true, createDrawing }
    preview = createPreview({ omitTitle: true, drawingProps })
    expect(document.querySelector('.antiTitle')).toBeNull()
    expect(drawingProps.createDrawing).not.toBe(createDrawing)

    const data = { content: 'drawing data' }
    await expect(drawingProps.createDrawing(data)).resolves.toBe(drawing)
    expect(createDrawing).toHaveBeenCalledWith(data)
    expect(drawingProps.drawings).toEqual([drawing])

    const sizes: boolean[] = []
    preview.popup.$on('fullsize', (event) => sizes.push(event.detail))
    const toggle = document.querySelectorAll('button')[1]
    toggle.focus()
    toggle.click()
    toggle.click()
    expect(sizes).toEqual([true, false])
    expect(document.activeElement).toBe(toggle)
  })

  it('focuses a named heading outside the tab order', () => {
    preview = createPreview()
    const title = document.querySelector('[role="heading"]')
    expect(document.activeElement).toBe(title)
    expect(title?.getAttribute('aria-level')).toBe('1')
    expect(title?.getAttribute('aria-label')).toBe('image.png')
    expect(title?.textContent).toContain('image.png')
    expect(title?.getAttribute('tabindex')).toBe('-1')
  })
})
