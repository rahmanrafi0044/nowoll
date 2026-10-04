import { applyDecorators, UseGuards } from '@nestjs/common'
import { AdminGuard } from '../guards/admin.guard.js'

// Marks a route as admin-only: @AdminOnly() above the handler.
export const AdminOnly = () => applyDecorators(UseGuards(AdminGuard))
