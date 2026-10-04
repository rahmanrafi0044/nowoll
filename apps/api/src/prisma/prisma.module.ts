import { Global, Module } from '@nestjs/common'
import { PrismaService } from './prisma.service.js'

// @Global: every feature module (products, orders, …) can inject PrismaService
// without importing PrismaModule again.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
