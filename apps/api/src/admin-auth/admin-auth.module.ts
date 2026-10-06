import { Global, Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { AdminGuard, AdminPasswordStepGuard } from '../common/guards/admin.guard.js'
import { AdminAuthController } from './admin-auth.controller.js'
import { AdminAuthService } from './admin-auth.service.js'

// Admin sign-in (step 29a). GLOBAL because AdminGuard sits on routes in many
// modules (products, returns, inventory, …) and each needs the guard's
// dependencies — AdminAuthService and AUTH_CONFIG (re-exported from AuthModule).
@Global()
@Module({
  imports: [AuthModule],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminGuard, AdminPasswordStepGuard],
  exports: [AdminAuthService, AdminGuard, AdminPasswordStepGuard, AuthModule],
})
export class AdminAuthModule {}
