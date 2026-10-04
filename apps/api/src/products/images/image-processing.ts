import sharp from 'sharp'

export type ImageKind = 'jpeg' | 'png' | 'webp'

/**
 * Identifies an image by its first bytes ("magic numbers") — NOT by the file
 * name or the Content-Type header, which the uploader controls and can fake.
 * A PHP script renamed to photo.jpg starts with "<?php", not FF D8 FF.
 */
export function detectImageKind(bytes: Buffer): ImageKind | null {
  const startsWith = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b)

  if (startsWith([0xff, 0xd8, 0xff])) return 'jpeg'
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  // WebP: "RIFF" <4-byte size> "WEBP"
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return 'webp'
  return null
}

// Product photos never need more than this on any screen; next/image makes
// smaller versions on demand. Keeps storage and page weight down.
const MAX_DIMENSION = 2400
// Refuse absurd sizes before decoding ("decompression bombs": a tiny file that
// expands to gigabytes of pixels and crashes the server). 40 MP ≈ 7300×5500.
const MAX_INPUT_PIXELS = 40_000_000

export interface ProcessedImage {
  data: Buffer
  contentType: `image/${ImageKind}`
  extension: 'jpg' | 'png' | 'webp'
  width: number
  height: number
}

/**
 * Re-saves the image (decision #4):
 *  - .rotate() first applies the phone's orientation flag, so photos aren't sideways
 *  - re-encoding drops ALL metadata — including GPS coordinates of where the
 *    photo was taken (sharp only keeps metadata if asked with keepMetadata())
 *  - shrinks anything larger than 2400px on its longest side
 * Throws if the bytes aren't a decodable image (corrupt or disguised files).
 */
export async function processImage(input: Buffer, kind: ImageKind): Promise<ProcessedImage> {
  let pipeline = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
    .rotate()
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })

  pipeline =
    kind === 'jpeg'
      ? pipeline.jpeg({ quality: 88, mozjpeg: true })
      : kind === 'png'
        ? pipeline.png({ compressionLevel: 9 })
        : pipeline.webp({ quality: 88 })

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true })
  return {
    data,
    contentType: `image/${kind}`,
    extension: kind === 'jpeg' ? 'jpg' : kind,
    width: info.width,
    height: info.height,
  }
}
