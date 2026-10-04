// ADAPTER PATTERN: the products module talks to this small interface, never to
// Supabase directly. Production plugs in SupabaseImageStorage; tests plug in an
// in-memory version — so `pnpm test` never uploads to your real project, and
// switching storage provider later would only mean writing a new adapter.
export interface ImageStorage {
  /** Saves a file. Paths are unique (random ids), so files are never overwritten. */
  upload(path: string, data: Buffer, contentType: string): Promise<void>
  /** Deletes files. Missing files are not an error. */
  remove(paths: string[]): Promise<void>
  /** The public URL customers' browsers load the image from. */
  publicUrl(path: string): string
}

// NestJS injection token: `@Inject(IMAGE_STORAGE) storage: ImageStorage`
export const IMAGE_STORAGE = Symbol('IMAGE_STORAGE')

export const PRODUCT_IMAGES_BUCKET = 'product-images'
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB (CLAUDE.md §11.7)
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
