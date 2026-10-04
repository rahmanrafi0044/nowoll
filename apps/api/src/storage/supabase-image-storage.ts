import { BadGatewayException, Logger } from '@nestjs/common'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { type ImageStorage, PRODUCT_IMAGES_BUCKET } from './image-storage.js'

// Supabase Storage implementation. Contract: docs/integrations/supabase.md.
// Uses the service role key, which bypasses Storage RLS — that's why this only
// ever runs inside the API, behind @AdminOnly() routes.
export class SupabaseImageStorage implements ImageStorage {
  private readonly logger = new Logger(SupabaseImageStorage.name)
  private readonly client: SupabaseClient

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    // A server-side client: no browser session to persist or refresh.
    this.client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }

  private get bucket() {
    return this.client.storage.from(PRODUCT_IMAGES_BUCKET)
  }

  async upload(path: string, data: Buffer, contentType: string): Promise<void> {
    const { error } = await this.bucket.upload(path, data, {
      contentType,
      upsert: false, // never silently replace an existing file
      // File names are random and never reused, so browsers/CDNs may cache for a year.
      cacheControl: '31536000',
    })
    if (error) {
      this.logger.error(`Upload failed for ${path}: ${error.message}`)
      throw new BadGatewayException('Image storage is unavailable. Please try again.')
    }
  }

  async remove(paths: string[]): Promise<void> {
    if (paths.length === 0) return
    const { error } = await this.bucket.remove(paths)
    if (error) throw new Error(`Supabase Storage remove failed: ${error.message}`)
  }

  publicUrl(path: string): string {
    return this.bucket.getPublicUrl(path).data.publicUrl
  }
}
