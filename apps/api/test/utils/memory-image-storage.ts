import type { ImageStorage } from '../../src/storage/image-storage.js'

/** Test double for ImageStorage: keeps "uploaded" files in a Map instead of Supabase. */
export class MemoryImageStorage implements ImageStorage {
  readonly files = new Map<string, { data: Buffer; contentType: string }>()

  async upload(path: string, data: Buffer, contentType: string): Promise<void> {
    if (this.files.has(path)) throw new Error(`already exists: ${path}`)
    this.files.set(path, { data, contentType })
  }

  async remove(paths: string[]): Promise<void> {
    for (const p of paths) this.files.delete(p)
  }

  publicUrl(path: string): string {
    return `https://test-project.supabase.co/storage/v1/object/public/product-images/${path}`
  }
}
