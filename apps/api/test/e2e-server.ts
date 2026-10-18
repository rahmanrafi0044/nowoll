// ============================================================================
// The API for the BROWSER TESTS (step 50) — started by tests/e2e/run-e2e.ts.
//
// It is the real production build (dist/), with ONE thing swapped: sign-in
// goes to the pretend Supabase Auth (FakeAuthProvider) instead of the real
// one, so the tests can sign in to the admin panel — password AND the 2FA
// code — without a Supabase project, secrets or network. Everything else
// (database, Redis queues, rate limits, cookies, guards) is the real thing.
//
// Photos are swapped too (kept in memory, see E2ePhotoStorage below).
//
// Safety: this file lives in test/, which is never compiled into dist/ nor
// copied into a Docker image (api.Dockerfile, .dockerignore), and it refuses
// to start in production. Accounts come from E2E_FAKE_ACCOUNTS (JSON), with
// the same ids the e2e seed gives those users in the database.
// ============================================================================
import 'reflect-metadata'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { Test } from '@nestjs/testing'
import { FakeAuthProvider } from './utils/fake-auth-provider.js'
import { MemoryImageStorage } from './utils/memory-image-storage.js'

if (process.env.NODE_ENV === 'production') throw new Error('e2e-server never runs in production')

// The COMPILED app (Nest's dependency injection needs the decorator metadata
// that the TypeScript build emits). Loaded by a computed path so the type
// checker doesn't look for declarations in dist/ — the types come from src/.
const dist = '../dist/'
const { AppModule } = (await import(
  dist + 'app.module.js'
)) as typeof import('../src/app.module.js')
const { configureApp } = (await import(
  dist + 'app.setup.js'
)) as typeof import('../src/app.setup.js')
const { AUTH_PROVIDER } = (await import(
  dist + 'auth/auth-provider.js'
)) as typeof import('../src/auth/auth-provider.js')
const { IMAGE_STORAGE } = (await import(
  dist + 'storage/image-storage.js'
)) as typeof import('../src/storage/image-storage.js')

// Photos uploaded in the tests are kept in memory — never sent to Supabase —
// and get addresses under NEXT_PUBLIC_SUPABASE_URL (a never-existing
// ".invalid" domain in the tests): the product saves, the picture just doesn't load.
class E2ePhotoStorage extends MemoryImageStorage {
  override publicUrl(path: string): string {
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${path}`
  }
}

const auth = new FakeAuthProvider()
const accounts = JSON.parse(process.env.E2E_FAKE_ACCOUNTS ?? '[]') as {
  id: string
  email: string
  password: string
  fullName: string
}[]
for (const a of accounts) auth.addAccount(a.email, a.password, a.fullName, a.id)

const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(AUTH_PROVIDER)
  .useValue(auth)
  .overrideProvider(IMAGE_STORAGE)
  .useValue(new E2ePhotoStorage())
  .compile()
const app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true })
configureApp(app)
await app.listen(Number(process.env.PORT ?? 3101))
// eslint-disable-next-line no-console -- run-e2e.ts shows this line while starting
console.log(
  `e2e API ready on :${process.env.PORT ?? 3101} (pretend sign-in, ${accounts.length} accounts)`,
)
