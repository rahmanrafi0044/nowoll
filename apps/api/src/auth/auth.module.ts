import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AUTH_CONFIG, authConfigFrom, supabaseAuthFromConfig } from './auth-config.js'
import { AUTH_PROVIDER } from './auth-provider.js'
import { AuthController } from './auth.controller.js'
import { OptionalSignInGuard, SignedInGuard } from './auth.guard.js'
import { AuthService } from './auth.service.js'

// Customer accounts (Phase 4 step 22). Staff/admin sign-in is separate (Phase 5).
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SignedInGuard,
    OptionalSignInGuard,
    // FACTORY PROVIDERS: built from the validated env. Tests replace AUTH_PROVIDER with a fake.
    { provide: AUTH_PROVIDER, inject: [ConfigService], useFactory: supabaseAuthFromConfig },
    { provide: AUTH_CONFIG, inject: [ConfigService], useFactory: authConfigFrom },
  ],
  // Other modules put SignedInGuard / OptionalSignInGuard on their routes.
  exports: [AuthService, SignedInGuard, OptionalSignInGuard, AUTH_CONFIG],
})
export class AuthModule {}
