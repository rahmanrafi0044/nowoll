import { Module } from '@nestjs/common'
import { AdminCustomersController } from './admin-customers.controller.js'
import { AdminCustomersService } from './admin-customers.service.js'

// Customer accounts in the admin panel (step 32).
@Module({
  controllers: [AdminCustomersController],
  providers: [AdminCustomersService],
})
export class CustomersModule {}
