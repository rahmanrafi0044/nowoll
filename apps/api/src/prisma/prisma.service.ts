import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaClient, prismaClientOptions } from '@nowoll/database'
import type { EnvironmentVariables } from '../config/env.validation.js'

// PrismaService IS a PrismaClient (it extends it), wrapped as a NestJS provider.
// Any service can ask for it in its constructor and get the one shared
// instance (dependency injection) — e.g. `this.prisma.product.findMany()`.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService<EnvironmentVariables, true>) {
    super(prismaClientOptions(config.get('DATABASE_URL', { infer: true })))
  }

  // Connect at startup so a wrong DATABASE_URL fails immediately, not on the first request.
  async onModuleInit(): Promise<void> {
    await this.$connect()
  }

  // Close connections cleanly when the server stops (deploys, restarts).
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }
}
