import { Module } from '@nestjs/common'
import { StaffController } from './staff.controller.js'
import { StaffService } from './staff.service.js'

// Staff management (step 38e). AUTH_PROVIDER comes from the global admin-auth module.
@Module({ controllers: [StaffController], providers: [StaffService] })
export class StaffModule {}
