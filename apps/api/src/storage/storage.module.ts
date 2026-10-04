import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { EnvironmentVariables } from '../config/env.validation.js'
import { IMAGE_STORAGE } from './image-storage.js'
import { SupabaseImageStorage } from './supabase-image-storage.js'

@Global()
@Module({
  providers: [
    {
      // FACTORY PROVIDER: builds the real adapter from config at startup.
      // Tests replace IMAGE_STORAGE with an in-memory adapter.
      provide: IMAGE_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        new SupabaseImageStorage(
          config.get('NEXT_PUBLIC_SUPABASE_URL', { infer: true }),
          config.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true }),
        ),
    },
  ],
  exports: [IMAGE_STORAGE],
})
export class StorageModule {}
