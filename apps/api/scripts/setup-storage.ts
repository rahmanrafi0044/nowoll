// ============================================================================
// pnpm storage:setup — creates/updates the Supabase Storage bucket for product
// images, then proves it works. Safe to run any number of times (idempotent).
// Run once per Supabase project: local/dev now, production before launch.
// Contract: docs/integrations/supabase.md
// ============================================================================
/* eslint-disable no-console -- this is a command-line script; printing is its job */
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  PRODUCT_IMAGES_BUCKET,
} from '../src/storage/image-storage.js'
import { SupabaseImageStorage } from '../src/storage/supabase-image-storage.js'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set (root .env).`)
  return value
}

const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
const anonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const settings = {
  public: true, // customers' browsers load product photos directly
  fileSizeLimit: MAX_IMAGE_BYTES, // enforced by Supabase too, not only by our API
  allowedMimeTypes: [...ALLOWED_IMAGE_TYPES],
}

async function main() {
  console.log(`Supabase project: ${new URL(url).host}`)

  // 1. Create the bucket, or bring an existing one in line with our settings.
  const existing = await admin.storage.getBucket(PRODUCT_IMAGES_BUCKET)
  if (existing.data) {
    const { error } = await admin.storage.updateBucket(PRODUCT_IMAGES_BUCKET, settings)
    if (error) throw new Error(`updateBucket failed: ${error.message}`)
    console.log(`✓ bucket "${PRODUCT_IMAGES_BUCKET}" already existed — settings updated`)
  } else {
    const { error } = await admin.storage.createBucket(PRODUCT_IMAGES_BUCKET, settings)
    if (error) throw new Error(`createBucket failed: ${error.message}`)
    console.log(`✓ bucket "${PRODUCT_IMAGES_BUCKET}" created`)
  }
  console.log(
    `  public read, max ${MAX_IMAGE_BYTES / 1024 / 1024} MB, types: ${settings.allowedMimeTypes.join(', ')}`,
  )

  // 2. Round trip through the SAME adapter the API uses.
  const storage = new SupabaseImageStorage(url, serviceKey)
  const probePath = `_setup-check/${randomUUID()}.png`
  const probe = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#000' } })
    .png()
    .toBuffer()

  await storage.upload(probePath, probe, 'image/png')
  try {
    const res = await fetch(storage.publicUrl(probePath))
    if (!res.ok || res.headers.get('content-type') !== 'image/png') {
      throw new Error(`public URL returned ${res.status} ${res.headers.get('content-type')}`)
    }
    console.log('✓ upload with the service key works, and the public URL serves the image')
  } finally {
    await storage.remove([probePath])
  }
  console.log('✓ test file deleted')

  // 3. Security check: the PUBLIC anon key (shipped to browsers) must NOT be able to upload.
  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const sneakyPath = `_setup-check/${randomUUID()}.png`
  const sneaky = await anon.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(sneakyPath, probe, { contentType: 'image/png' })
  if (!sneaky.error) {
    await storage.remove([sneakyPath])
    throw new Error(
      'SECURITY: the public anon key was able to upload! Check Storage policies in the Supabase dashboard.',
    )
  }
  console.log('✓ the public (anon) key cannot upload — only the API can')
  console.log('\nStorage is ready.')
}

main().catch((error: unknown) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
