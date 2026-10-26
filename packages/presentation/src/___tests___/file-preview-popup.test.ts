/** @jest-environment jsdom */
// SPDX-License-Identifier: EPL-2.0

import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { compile } from 'svelte/compiler'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { concatLink } from '@hcengineering/core'
import '@testing-library/jest-dom'

interface TranslationCatalog {
  string: Record<string, string>
}

const english = JSON.parse(readFileSync(resolve(__dirname, '../../lang/en.json'), 'utf8')) as TranslationCatalog

interface MountedComponent {
  $destroy: () => void
  $on: (event: string, callback: (event: CustomEvent) => void) => void
  $set: (props: Record<string, unknown>) => void
}

type ComponentConstructor = new (options: { target: HTMLElement, props?: Record<string, unknown> }) => MountedComponent

interface PreviewFixture {
  popup: MountedComponent
  actionHandler: MountedComponent
  modes: string[]
  actions: string[]
  pendingActions: PendingAction[]
  tick: () => Promise<void>
  fileUrls: jest.Mock<string, [string, string, string?]>
  finishPreviewType: () => Promise<void>
}

interface PreviewStorage {
  getFileUrl: (workspace: string, file: string, filename?: string) => string
}

interface StorageConstructor {
  new (baseUrl: string): PreviewStorage
}

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

interface PendingAction {
  id: string
  resolveResource: () => void
  completed: Promise<void>
}

interface DrawingProps {
  drawingAvailable: boolean
  createDrawing: (data: unknown) => Promise<unknown>
  drawings?: unknown[]
  loadDrawings?: () => Promise<unknown[]>
}

interface PreviewOptions {
  omitTitle?: boolean
  drawingProps?: DrawingProps
  name?: string
  showIcon?: boolean
  file?: string
  storage?: 'front' | 'datalake'
}

function createDeferred<T> (): Deferred<T> {
  let resolvePromise: ((value: T) => void) | undefined
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  if (resolvePromise === undefined) throw new Error('Missing deferred resolver')
  return { promise, resolve: resolvePromise }
}

// Load the browser runtime together with compiled components, without replacing
// their lifecycle, event forwarding, or ActionHandler's keyboard processing.
// This is a synthetic focus/action-dispatch fixture: actions and selection are
// invented, most cases supply no file, and the drawing object tests only the callback
// wrapper. Modal, ButtonIcon, ButtonBase and Label are real in the normal fixture.
// General Button, DownloadFileButton, FileTypeIcon, Header, Scroller, content and
// extensions are slot replacements; registerFocus is stubbed. The missing-title
// case also replaces Modal to omit its title slot.
// Storage cases additionally load real FilePreview, DownloadFileButton, FileTypeIcon,
// presentation getFileUrl, FrontStorage/DatalakeStorage and path encoding. Metadata,
// preview-type lookup, resize observation and upload helpers are stubs. A synthetic
// file ID exercises URL forwarding/download attributes, without fetching a blob.
// FilePreview's SCSS is removed before compilation; no fixture attaches CSS.
// It does not cover image rendering/switching, actual selection/navigation,
// PopupInstance resizing, CSS, native Enter/Space button activation, persistence
// or assistive-technology announcements. Translation uses the English catalog.
function createPreview (options: PreviewOptions = {}): PreviewFixture {
  const cache = new Map<string, { exports: Record<string, unknown> }>()
  const svelteRoot = dirname(require.resolve('svelte/package.json'))
  const components = resolve(__dirname, '../components')
  const ui = resolve(components, '../../../ui/src/components')
  const handler = resolve(components, '../../../../plugins/view-resources/src/components/ActionHandler.svelte')
  const storageClients = resolve(components, '../../../../foundations/core/packages/storage-client/src/client')
  const modes: string[] = []
  const actions: string[] = []
  const pendingActions: PendingAction[] = []
  const previewType = createDeferred<undefined>()
  let storage: PreviewStorage | undefined
  const fileUrls = jest.fn<string, [string, string, string?]>((workspace, file, filename) => {
    if (storage === undefined) throw new Error('Missing fixture storage')
    return storage.getFileUrl(workspace, file, filename)
  })
  const compilerOptions = { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 }
  const mockedImports = [
    '../index',
    '../plugin',
    '..',
    '../actions',
    '../selection',
    '../utils',
    '../focus',
    '../tooltips',
    '../filetypes',
    '../preview',
    '../image',
    '../upload',
    './plugin',
    './filetypes',
    'uuid'
  ]

  function load (filename: string): Record<string, unknown> {
    const cached = cache.get(filename)
    if (cached !== undefined) return cached.exports
    const module = { exports: {} }
    cache.set(filename, module)
    let source = readFileSync(filename, 'utf8')
    if (filename.endsWith('.svelte')) {
      if (filename === resolve(components, 'FilePreview.svelte')) {
        source = source.replace(/<style[\s\S]*?<\/style>/, '')
      }
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
      if (id === '../file') return load(resolve(components, '../file.ts'))
      if (id === './utils' && filename.startsWith(storageClients)) return load(resolve(storageClients, 'utils.ts'))
      if (id.startsWith('@hcengineering/') || mockedImports.includes(id)) return mocks
      if (id.endsWith('.svelte')) {
        if (['Modal', 'ButtonIcon', 'ButtonBase', 'Label'].some((name) => id === `./${name}.svelte`)) {
          return load(resolve(ui, id))
        }
        if (id === './ActionContext.svelte') return load(resolve(components, id))
        if (
          options.storage !== undefined &&
          ['FilePreview', 'DownloadFileButton', 'FileTypeIcon'].some((name) => id === `./${name}.svelte`)
        ) {
          return load(resolve(components, id))
        }
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
  const { tick } = load(resolve(svelteRoot, 'src/runtime/index.js')) as { tick: () => Promise<void> }
  const mocks = {
    default: {
      class: { TxRemoveDoc: 'remove' },
      string: { DocumentPreview: 'DocumentPreview' },
      extension: {},
      metadata: { WorkspaceUuid: 'workspace', FileStorage: 'storage' }
    },
    Analytics: { handleError: jest.fn(), handleEvent: jest.fn() },
    SortingOrder: { Descending: -1 },
    generateId: () => 'preview',
    concatLink,
    getMetadata: (key: string): unknown => {
      if (key === 'workspace') return 'w'
      if (key === 'storage') return { getFileUrl: fileUrls }
      throw new Error(`Unexpected metadata key: ${key}`)
    },
    getPreviewType: () => previewType.promise,
    resizeObserver: () => ({}),
    getEmbeddedLabel: (value: string) => value,
    translateCB: (label: string, _params: unknown, _language: string, callback: (value: string) => void) => {
      callback(english.string[label])
    },
    tooltip: () => ({}),
    registerFocus: () => ({ idx: -1 }),
    addTxListener: () => {},
    getClient: () => ({}),
    reduceCalls: (fn: unknown) => fn,
    getSelection: () => [],
    getResource: async (action: string): Promise<() => void> => {
      const resource = createDeferred<() => void>()
      const completed = createDeferred<void>()
      pendingActions.push({
        id: action,
        resolveResource: () => {
          resource.resolve(() => {
            actions.push(action)
            completed.resolve(undefined)
          })
        },
        completed: completed.promise
      })
      return resource.promise
    },
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
    themeStore: writable({ language: 'en' }),
    deviceOptionsStore: writable({ docHeight: 1000, fontSize: 16 }),
    previewTypes: writable([]),
    ComponentExtensions: slot,
    Component: slot,
    Loading: slot,
    Button: slot,
    get Label () {
      return load(resolve(ui, 'Label.svelte')).default
    },
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
  if (options.storage !== undefined) {
    const storageName = options.storage === 'front' ? 'FrontStorage' : 'DatalakeStorage'
    const Storage = load(resolve(storageClients, `${options.storage}.ts`))[storageName] as StorageConstructor
    storage = new Storage('https://files.example')
  }
  const Handler = load(handler).default as ComponentConstructor
  const Preview = load(resolve(components, 'FilePreviewPopup.svelte')).default as ComponentConstructor
  const actionHandler = new Handler({ target: document.body })
  const popup = new Preview({
    target: document.body,
    props: {
      name: Object.prototype.hasOwnProperty.call(options, 'name') ? options.name : 'image.png',
      showIcon: options.showIcon ?? true,
      contentType: 'image/png',
      metadata: undefined,
      file: options.file,
      props: options.drawingProps
    }
  })
  return {
    popup,
    actionHandler,
    modes,
    actions,
    pendingActions,
    tick,
    fileUrls,
    finishPreviewType: async (): Promise<void> => {
      previewType.resolve(undefined)
      await previewType.promise
      await tick()
    }
  }
}

describe('file preview keyboard focus', () => {
  let preview: ReturnType<typeof createPreview>

  afterEach(() => {
    preview?.popup.$destroy()
    preview?.actionHandler.$destroy()
    document.body.innerHTML = ''
    jest.restoreAllMocks()
  })

  function press (key: string): void {
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true }))
  }

  async function pressAction (key: string): Promise<void> {
    const previousActions = [...preview.actions]
    press(key)
    expect(preview.pendingActions).toHaveLength(1)
    const request = preview.pendingActions.shift()
    if (request === undefined) throw new Error('Missing action resource request')
    expect(request.id).toBe(key)
    expect(preview.actions).toEqual(previousActions)
    request.resolveResource()
    await request.completed
  }

  it('focuses the existing title on open and dispatches both arrow actions', async () => {
    const focus = jest.spyOn(HTMLElement.prototype, 'focus')
    preview = createPreview()
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(document.activeElement?.classList.contains('antiTitle')).toBe(true)
    expect(document.querySelector('.hulyModal-container')?.parentElement).toBe(document.body)
    await pressAction('ArrowRight')
    await pressAction('ArrowLeft')
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
      await pressAction('ArrowRight')
      await pressAction('ArrowLeft')
      expect(document.activeElement?.classList.contains('antiTitle')).toBe(true)
    }
    expect(sizes).toEqual([true, false])
    expect(preview.actions).toEqual(['ArrowRight', 'ArrowLeft', 'ArrowRight', 'ArrowLeft'])
  })

  it('preserves input mode for focused buttons, including after arrow navigation', async () => {
    preview = createPreview()
    await pressAction('ArrowRight')
    const close = document.querySelector('button')
    close?.focus()
    for (const key of ['Enter', ' ', 'ArrowRight', 'ArrowLeft']) {
      press(key)
      expect(preview.modes).toEqual(['browser', 'input'])
      expect(preview.pendingActions).toHaveLength(0)
    }
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

  it('keeps the current attachment drawings when an older load finishes later', async () => {
    const first = createDeferred<unknown[]>()
    const second = createDeferred<unknown[]>()
    const loadDrawings = jest
      .fn<Promise<unknown[]>, []>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const drawingProps: DrawingProps = {
      drawingAvailable: true,
      createDrawing: async () => undefined,
      loadDrawings
    }
    preview = createPreview({ file: 'first', drawingProps })
    expect(loadDrawings).toHaveBeenCalledTimes(1)

    preview.popup.$set({ file: 'second' })
    await preview.tick()
    expect(loadDrawings).toHaveBeenCalledTimes(2)
    const current = [{ _id: 'current-drawing' }]
    second.resolve(current)
    await second.promise
    await preview.tick()
    expect(drawingProps.drawings).toBe(current)

    first.resolve([{ _id: 'old-drawing' }])
    await first.promise
    await preview.tick()
    expect(drawingProps.drawings).toBe(current)
  })

  it('ignores drawing loads that finish after the popup is destroyed', async () => {
    const drawings = createDeferred<unknown[]>()
    const drawingProps: DrawingProps = {
      drawingAvailable: true,
      createDrawing: async () => undefined,
      loadDrawings: () => drawings.promise
    }
    preview = createPreview({ file: 'f', drawingProps })
    preview.popup.$destroy()

    drawings.resolve([{ _id: 'old-drawing' }])
    await drawings.promise
    await preview.tick()
    expect(drawingProps.drawings).toBeUndefined()
  })

  it('focuses a named heading outside the tab order', () => {
    preview = createPreview()
    const title = document.querySelector('[role="heading"]')
    expect(document.activeElement).toBe(title)
    expect(title?.getAttribute('aria-level')).toBe('1')
    expect(title).toHaveAccessibleName('image.png')
    expect(title?.textContent).toContain('image.png')
    expect(title?.getAttribute('tabindex')).toBe('-1')
  })

  it.each([
    { name: '', showIcon: false },
    { name: '   ', showIcon: false },
    { name: undefined, showIcon: true }
  ])('names an unnamed preview with filename $name and showIcon $showIcon', async ({ name, showIcon }) => {
    preview = createPreview({ name, showIcon })
    const title = document.querySelector('[role="heading"]')
    expect(document.activeElement).toBe(title)
    expect(title?.getAttribute('aria-level')).toBe('1')
    expect(title?.getAttribute('tabindex')).toBe('-1')
    expect(title?.querySelector('.wrapped-icon') !== null).toBe(showIcon)
    expect(title).toHaveAccessibleName(english.string.DocumentPreview)
    expect(title?.textContent).toContain(english.string.DocumentPreview)

    preview.popup.$set({ name: 'updated.png' })
    await preview.tick()
    expect(title).toHaveAccessibleName('updated.png')
    expect(title?.textContent).toContain('updated.png')
    expect(document.activeElement).toBe(title)

    preview.popup.$set({ name })
    await preview.tick()
    expect(title).toHaveAccessibleName(english.string.DocumentPreview)
    expect(title?.textContent).toContain(english.string.DocumentPreview)
    expect(document.activeElement).toBe(title)
  })

  it.each([
    {
      storage: 'front' as const,
      absentUrl: 'https://files.example/w/f?file=f&workspace=w',
      namedUrl: 'https://files.example/w/updated.png?file=f&workspace=w',
      emptyUrl: 'https://files.example/w/?file=f&workspace=w'
    },
    {
      storage: 'datalake' as const,
      absentUrl: 'https://files.example/blob/w/f',
      namedUrl: 'https://files.example/blob/w/f/updated.png',
      emptyUrl: 'https://files.example/blob/w/f/'
    }
  ])(
    'preserves absent and empty filenames through $storage storage',
    async ({ storage, absentUrl, namedUrl, emptyUrl }) => {
      preview = createPreview({ file: 'f', name: undefined, storage })
      await preview.finishPreviewType()
      const title = document.querySelector('[role="heading"]')

      function expectFilename (name: string | undefined, url: string): void {
        expect(preview.fileUrls.mock.calls).toEqual([
          ['w', 'f', name],
          ['w', 'f', name]
        ])
        expect(preview.fileUrls.mock.results.map((result) => result.value)).toEqual([url, url])
        const links = document.querySelectorAll('a.no-line')
        expect(links).toHaveLength(2)
        links.forEach((link) => {
          expect(link.getAttribute('href')).toBe(url)
          expect(link.getAttribute('download')).toBe(name ?? null)
        })
        expect(title).toHaveAccessibleName(name === undefined || name === '' ? english.string.DocumentPreview : name)
        expect(document.activeElement).toBe(title)
      }

      expectFilename(undefined, absentUrl)
      for (const { name, url } of [
        { name: 'updated.png', url: namedUrl },
        { name: undefined, url: absentUrl },
        { name: '', url: emptyUrl }
      ]) {
        preview.fileUrls.mockClear()
        preview.popup.$set({ name })
        await preview.tick()
        expectFilename(name, url)
      }
    }
  )
})
