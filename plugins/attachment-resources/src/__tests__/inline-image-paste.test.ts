/** @jest-environment jsdom */
// SPDX-License-Identifier: EPL-2.0

import { type Class, type Doc, type Ref, type Space, type WorkspaceUuid } from '@hcengineering/core'
import { setMetadata } from '@hcengineering/platform'
import presentation, { type getFileStorage, setUploadGuard } from '@hcengineering/presentation'
import { tick } from 'svelte'
import AttachmentRefInput from '../components/AttachmentRefInput.svelte'
import { inserted } from './inline-image-fixture'

jest.mock('../../../../packages/presentation/src/filetypes', () => ({ getFileMetadata: async () => ({}) }))
jest.mock('@hcengineering/presentation', () => ({
  __esModule: true,
  default: jest.requireActual('../../../../packages/presentation/src/plugin').default,
  ...jest.requireActual('../../../../packages/presentation/src/file'),
  ...jest.requireActual('../../../../packages/presentation/src/image'),
  DraftController: class {
    save (): void {}
    remove (): void {}
  },
  draftsStore: jest.requireActual('svelte/store').writable({}),
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
  const revokeObjectURL = jest.fn()
  const uploadFile = jest.fn<Promise<void>, Parameters<ReturnType<typeof getFileStorage>['uploadFile']>>(async () => {})
  const storage: ReturnType<typeof getFileStorage> = {
    getFileUrl: jest.fn(),
    getCookiePath: jest.fn(),
    getFileMeta: jest.fn(),
    uploadFile,
    deleteFile: jest.fn(async () => {})
  }
  let target: HTMLDivElement
  let composer: AttachmentRefInput

  beforeEach(() => {
    jest.clearAllMocks()
    inserted.length = 0
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    setMetadata(presentation.metadata.WorkspaceUuid, 'workspace' as WorkspaceUuid)
    setMetadata(presentation.metadata.FileStorage, storage)
    URL.createObjectURL = jest.fn(() => 'blob:clipboard')
    URL.revokeObjectURL = revokeObjectURL
    // Model a browser decode/CSP error, including the non-Error event the browser supplies.
    jest.spyOn(globalThis, 'Image').mockImplementation(() => {
      const image = document.createElement('img')
      jest.spyOn(image, 'src', 'set').mockImplementation((src) => {
        image.setAttribute('src', src)
        queueMicrotask(() => image.dispatchEvent(new Event('error')))
      })
      return image
    })
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
    jest.restoreAllMocks()
    setUploadGuard(undefined)
    setMetadata(presentation.metadata.WorkspaceUuid, undefined)
    setMetadata(presentation.metadata.FileStorage, undefined)
  })

  it.each(['image/webp', 'image/png'])(
    'uploads and inserts %s when clipboard dimensions cannot be decoded',
    async (type) => {
      const bytes = Uint8Array.from(
        atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='),
        (char) => char.charCodeAt(0)
      )
      const file = new File([bytes], 'image.png', { type })
      // jsdom File lacks arrayBuffer; browsers provide it. Keep real PNG chunk parsing.
      Object.defineProperty(file, 'arrayBuffer', {
        value: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      })
      const event = new Event('paste', { bubbles: true })
      Object.defineProperty(event, 'clipboardData', { value: { files: [file] } })
      target.querySelector('textarea')?.dispatchEvent(event)
      await settle()

      expect(uploadFile).toHaveBeenCalledTimes(1)
      expect(inserted).toHaveLength(1)
      const node = JSON.parse(inserted[0])
      expect(node.type).toBe('image')
      expect(node.attrs['file-id']).toBe(uploadFile.mock.calls[0][2])
      expect(node.attrs.alt).toBe('image.png')
      expect(node.attrs.width).toBeUndefined()
      expect(target.querySelector('textarea')?.disabled).toBe(false)
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:clipboard')
    }
  )
})
