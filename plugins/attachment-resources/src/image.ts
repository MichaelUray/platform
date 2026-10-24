// SPDX-License-Identifier: EPL-2.0

export interface ImageDimensions {
  width: number
  height: number
  fit: 'cover' | 'contain'
}

/** Calculate thumbnail dimensions from image size and pixel bounds. */
export function getBoundedImageDimensions (
  size: { width: number, height: number },
  bounds: { maxWidth: number, minWidth: number, maxHeight: number, minHeight: number }
): ImageDimensions {
  const ratio = size.height / size.width

  let width = Math.min(size.width, bounds.maxWidth)
  let height = Math.ceil(width * ratio)

  if (height > bounds.maxHeight) {
    width = bounds.maxHeight / ratio
    height = bounds.maxHeight
  }

  const readableWidth = Math.max(bounds.minWidth, Math.min(size.width, bounds.maxWidth))
  const cropTallImage = width < Math.max(bounds.minWidth, readableWidth / 2)
  const fit = cropTallImage || height < bounds.minHeight ? 'cover' : 'contain'
  if (cropTallImage) {
    // Keep a readable width and crop instead of scaling tall images into a sliver.
    width = readableWidth
  }
  height = Math.max(height, bounds.minHeight)

  return { width: Math.round(width), height: Math.round(height), fit }
}
