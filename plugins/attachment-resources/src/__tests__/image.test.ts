// SPDX-License-Identifier: EPL-2.0

import { getBoundedImageDimensions } from '../image'

describe('getBoundedImageDimensions', () => {
  const bounds = { minWidth: 64, maxWidth: 400, minHeight: 64, maxHeight: 400 }

  it.each([
    { width: 300, height: 3600 },
    { width: 300, height: 4000 },
    { width: 300, height: 1200 }
  ])('keeps tall images at their original width when scaling would make them too narrow: %j', (size) => {
    expect(getBoundedImageDimensions(size, bounds)).toEqual({
      width: 300,
      height: 400,
      fit: 'cover'
    })
  })

  it.each([
    { width: 800, height: 16000 },
    { width: 640, height: 4000 },
    { width: 640, height: 4001 },
    { width: 400, height: 1600 },
    { width: 400, height: 2000 }
  ])('caps the readable width of tall images at the maximum width: %j', (size) => {
    expect(getBoundedImageDimensions(size, bounds)).toEqual({
      width: 400,
      height: 400,
      fit: 'cover'
    })
  })

  it('enforces the minimum width for tall images narrower than the minimum', () => {
    expect(getBoundedImageDimensions({ width: 40, height: 3600 }, bounds)).toEqual({
      width: 64,
      height: 400,
      fit: 'cover'
    })
  })

  it.each([
    { width: 3600, height: 300 },
    { width: 4000, height: 200 }
  ])('crops wide images to the minimum height: %j', (size) => {
    expect(getBoundedImageDimensions(size, bounds)).toEqual({
      width: 400,
      height: 64,
      fit: 'cover'
    })
  })

  it('enforces both minimum dimensions for small images', () => {
    expect(getBoundedImageDimensions({ width: 20, height: 40 }, bounds)).toEqual({
      width: 64,
      height: 64,
      fit: 'cover'
    })
  })

  it.each([
    [
      { width: 800, height: 400 },
      { width: 400, height: 200, fit: 'contain' }
    ],
    [
      { width: 300, height: 800 },
      { width: 150, height: 400, fit: 'contain' }
    ],
    [
      { width: 100, height: 200 },
      { width: 100, height: 200, fit: 'contain' }
    ],
    [
      { width: 400, height: 800 },
      { width: 200, height: 400, fit: 'contain' }
    ]
  ])('preserves the aspect ratio when the scaled image fits the bounds: %j', (size, expected) => {
    expect(getBoundedImageDimensions(size, bounds)).toEqual(expected)
  })

  it('uses the supplied bounds for link preview images', () => {
    expect(
      getBoundedImageDimensions(
        { width: 300, height: 4000 },
        { minWidth: 64, maxWidth: 376, minHeight: 64, maxHeight: 240 }
      )
    ).toEqual({ width: 300, height: 240, fit: 'cover' })
  })
})
