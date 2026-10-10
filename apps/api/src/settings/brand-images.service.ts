import {
  BadRequestException,
  Inject,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import sharp, { type Metadata, type ResizeOptions } from 'sharp'
import { detectImageKind } from '../products/images/image-processing.js'
import { IMAGE_STORAGE, type ImageStorage } from '../storage/image-storage.js'

export const BRAND_IMAGE_KINDS = ['logo', 'favicon', 'share'] as const
export type BrandImageKind = (typeof BRAND_IMAGE_KINDS)[number]

/** Folder for the shop's own pictures — settings may ONLY point here (see ownImageUrl). */
export const BRAND_FOLDER = 'branding/'

// How each picture is prepared. The sizes are what the places that show them
// expect: a header logo, a browser-tab / home-screen icon, and the Facebook /
// WhatsApp link preview (1200×630).
const SPEC: Record<
  BrandImageKind,
  { min: [number, number]; resize: ResizeOptions; label: string }
> = {
  logo: {
    min: [60, 20],
    resize: { width: 600, height: 200, fit: 'inside', withoutEnlargement: true },
    label: 'A logo',
  },
  favicon: {
    min: [64, 64],
    resize: { width: 512, height: 512, fit: 'cover', position: 'centre' },
    label: 'A favicon',
  },
  share: {
    min: [600, 315],
    resize: { width: 1200, height: 630, fit: 'cover', position: 'centre' },
    label: 'A share image',
  },
}

/**
 * Logo, favicon and share image (step 38, part 2). The same safety as every
 * upload: the real type from the first bytes (JPEG, PNG, WebP — never SVG,
 * which can hide scripts), re-encoded (strips hidden data like GPS), a random
 * name, 5 MB max (controller). Then sized for where it's shown.
 * PNG / WebP keep transparency (logos often need it); the favicon is a PNG.
 */
@Injectable()
export class BrandImagesService {
  constructor(@Inject(IMAGE_STORAGE) private readonly storage: ImageStorage) {}

  async upload(
    kind: BrandImageKind,
    file: { buffer: Buffer } | undefined,
  ): Promise<{ url: string }> {
    if (!file || file.buffer.length === 0)
      throw new BadRequestException('Attach an image file in the "file" field.')
    const type = detectImageKind(file.buffer)
    if (!type)
      throw new UnsupportedMediaTypeException('Only JPEG, PNG and WebP images are allowed.')
    const spec = SPEC[kind]

    let meta: Metadata
    try {
      meta = await sharp(file.buffer, { limitInputPixels: 40_000_000 }).rotate().metadata()
    } catch {
      throw new BadRequestException('This image file is damaged or could not be read.')
    }
    const [minW, minH] = spec.min
    if ((meta.width ?? 0) < minW || (meta.height ?? 0) < minH)
      throw new BadRequestException(
        `${spec.label} needs to be at least ${minW}×${minH} pixels — this one is ${meta.width}×${meta.height}.`,
      )

    let pipeline = sharp(file.buffer, { limitInputPixels: 40_000_000, failOn: 'error' })
      .rotate()
      .resize(spec.resize)
    const out: 'png' | 'webp' | 'jpeg' = kind === 'favicon' ? 'png' : type
    pipeline =
      out === 'png'
        ? pipeline.png({ compressionLevel: 9 })
        : out === 'webp'
          ? pipeline.webp({ quality: 90 })
          : pipeline.jpeg({ quality: 88, mozjpeg: true })
    const data = await pipeline.toBuffer().catch(() => {
      throw new BadRequestException('This image file is damaged or could not be read.')
    })

    const path = `${BRAND_FOLDER}${kind}-${randomUUID()}.${out === 'jpeg' ? 'jpg' : out}`
    await this.storage.upload(path, data, `image/${out}`)
    return { url: this.storage.publicUrl(path) }
  }

  /** Is this link one of our own brand uploads? (Settings may not point anywhere else.) */
  ownImageUrl(url: string): boolean {
    const prefix = this.storage.publicUrl(`${BRAND_FOLDER}x`).slice(0, -1)
    return url.startsWith(prefix) && !url.slice(prefix.length).includes('/')
  }
}
