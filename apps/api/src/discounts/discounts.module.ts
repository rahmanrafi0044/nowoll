import { Module } from '@nestjs/common'
import { DiscountsController } from './discounts.controller.js'
import { DiscountsService } from './discounts.service.js'

@Module({
  controllers: [DiscountsController],
  providers: [DiscountsService],
  exports: [DiscountsService], // the orders module (step 18) calls redeem() / release()
})
export class DiscountsModule {}
