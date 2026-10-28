/** @jest-environment jsdom */
// SPDX-License-Identifier: EPL-2.0

import { type Class, type Doc, type Ref, type Space, type WorkspaceUuid } from '@hcengineering/core'
import { setMetadata } from '@hcengineering/platform'
import { tick } from 'svelte'
import AttachmentRefInput from '../components/AttachmentRefInput.svelte'
import { inserted } from './inline-image-fixture'
import presentation from '../../../../packages/presentation/src/plugin'
import { getFileStorage, setUploadGuard } from '../../../../packages/presentation/src/file'

jest.mock('../../../../packages/presentation/src/filetypes', () => ({ getFileMetadata: async () => ({}) }))
jest.mock('@hcengineering/presentation', () => ({
  ...jest.requireActual('../../../../packages/presentation/src/file'),
  ...jest.requireActual('../../../../packages/presentation/src/image'),
  DraftController: class {
    save (): void {}
    remove (): void {}
  },
  draftsStore: require('svelte/store').writable({}),
  getClient: () => ({}),
  createQuery: () => ({ query: jest.fn(), unsubscribe: jest.fn() }),
  isLinkPreviewEnabled: () => false
}))
jest.mock('@hcengineering/text-editor-resources', () => ({
  ReferenceInput: jest.requireActual('./ReferenceInputStub.svelte').default
}))
jest.mock('@hcengineering/ui', () => ({ Loading: jest.requireActual('./ReferenceInputStub.svelte').default }))
jest.mock('@hcengineering/uploader', () => ({ getUploadHandlers: () => [] }))
jest.mock('../components/AttachmentPresenter.svelte', () => jest.requireActual('./ReferenceInputStub.svelte'))

async function settle (): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve()
  await tick()
}

describe('comment composer clipboard image insertion', () => {
  const OriginalImage = global.Image
  const storage: ReturnType<typeof getFileStorage> = {
    getFileUrl: jest.fn(),
    getCookiePath: jest.fn(),
    getFileMeta: jest.fn(),
    uploadFile: jest.fn(async () => {}),
    deleteFile: jest.fn(async () => {})
  }
  let target: HTMLDivElement
  let composer: AttachmentRefInput
  let warn: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    inserted.length = 0
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    setMetadata(presentation.metadata.WorkspaceUuid, 'workspace' as WorkspaceUuid)
    setMetadata(presentation.metadata.FileStorage, storage)
    URL.createObjectURL = jest.fn(() => 'blob:clipboard')
    URL.revokeObjectURL = jest.fn()
    // Model a browser decode/CSP error, including the non-Error event the browser supplies.
    global.Image = class {
      onerror: ((event: Event) => void) | null = null
      set src (_value: string) {
        queueMicrotask(() => this.onerror?.(new Event('error')))
      }
    } as unknown as typeof Image
    target = document.createElement('div')
    document.body.append(target)
    composer = new AttachmentRefInput({
      target,
      props: {
        objectId: 'issue' as Ref<Doc>,
        space: 'space' as Ref<Space>,
        _class: 'issue-class' as Ref<Class<Doc>>,
        inlineImages: true,
        skipAttachmentsPreload: true
      }
    })
  })

  afterEach(async () => {
    composer.$destroy()
    await settle()
    target.remove()
    global.Image = OriginalImage
    warn.mockRestore()
    setUploadGuard(undefined)
    setMetadata(presentation.metadata.WorkspaceUuid, undefined)
    setMetadata(presentation.metadata.FileStorage, undefined)
  })

  it.each(['image/webp', 'image/png'])('uploads and inserts %s when clipboard dimensions cannot be decoded', async (type) => {
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64')
    const file = new File([bytes], 'image.png', { type })
    // jsdom File lacks arrayBuffer; browsers provide it. Keep real PNG chunk parsing.
    Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) })
    const event = new Event('paste', { bubbles: true })
    Object.defineProperty(event, 'clipboardData', { value: { files: [file] } })
    target.querySelector('textarea')?.dispatchEvent(event)
    await settle()

    expect(storage.uploadFile).toHaveBeenCalledTimes(1)
    expect(inserted).toHaveLength(1)
    const node = JSON.parse(inserted[0])
    expect(node.type).toBe('image')
    expect(node.attrs['file-id']).toBe(jest.mocked(storage.uploadFile).mock.calls[0][2])
    expect(node.attrs.alt).toBe('image.png')
    expect(node.attrs.width).toBeUndefined()
    expect(target.querySelector('textarea')?.disabled).toBe(false)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:clipboard')
  })
})
