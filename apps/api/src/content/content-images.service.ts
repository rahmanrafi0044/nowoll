import {
  BadRequestException,
  Inject,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { detectImageKind, processImage } from '../products/images/image-processing.js'
import { IMAGE_STORAGE, type ImageStorage } from '../storage/image-storage.js'

/**
 * Pictures for the homepage (hero, promo banners) — step 36. The SAME checks
 * as product photos: the file's real type is read from its first bytes (not
 * its name), it's re-encoded (which also strips hidden data like GPS
 * location), and it gets a random name. 5 MB max is enforced before we even
 * read it (see the controller).
 */
@Injectable()
export class ContentImagesService {
  constructor(@Inject(IMAGE_STORAGE) private readonly storage: ImageStorage) {}

  /** Also the size (step 43): blog photos carry it, so the shop reserves their space. */
  async upload(
    file: { buffer: Buffer } | undefined,
  ): Promise<{ url: string; width: number; height: number }> {
    if (!file || file.buffer.length === 0)
      throw new BadRequestException('Attach an image file in the "file" field.')
    const kind = detectImageKind(file.buffer)
    if (!kind)
      throw new UnsupportedMediaTypeException(
        'Only JPEG, PNG and WebP images are allowed. (iPhone HEIC photos: export them as JPEG first.)',
      )
    const processed = await processImage(file.buffer, kind).catch(() => {
      throw new BadRequestException('This image file is damaged or could not be read.')
    })
    const path = `content/${randomUUID()}.${processed.extension}`
    await this.storage.upload(path, processed.data, processed.contentType)
    return { url: this.storage.publicUrl(path), width: processed.width, height: processed.height }
  }
}
