/** @jest-environment jsdom */
// SPDX-License-Identifier: EPL-2.0

import { unknownError } from '@hcengineering/platform'
import { getImageSize } from '../image'

describe('image decode failures', () => {
  const OriginalImage = global.Image

  beforeEach(() => {
    URL.createObjectURL = jest.fn(() => 'blob:clipboard-image')
    URL.revokeObjectURL = jest.fn()
    global.Image = class {
      onerror: ((event: Event) => void) | null = null
      set src (_value: string) {
        queueMicrotask(() => this.onerror?.(new Event('error')))
      }
    } as unknown as typeof Image
  })

  afterEach(() => {
    global.Image = OriginalImage
  })

  it('rejects with an Error instead of the DOM Event that becomes BadError', async () => {
    const failure: unknown = await getImageSize(new Blob(['clipboard'], { type: 'image/webp' })).catch((err) => err)
    expect(failure).toBeInstanceOf(Error)
    expect(unknownError(failure).code).not.toBe('platform:status:BadError')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:clipboard-image')
  })
})
