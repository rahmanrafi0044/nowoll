import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { API_PREFIX, configureApp } from './app.setup.js'
import { AppModule } from './app.module.js'
import type { EnvironmentVariables } from './config/env.validation.js'

async function bootstrap(): Promise<void> {
  // rawBody: webhooks (Resend, step 42) are verified against the exact bytes sent.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true })
  configureApp(app)

  const port = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService).get('PORT', {
    infer: true,
  })
  await app.listen(port)
  Logger.log(`API ready at http://localhost:${port}/${API_PREFIX}`, 'Bootstrap')
}

await bootstrap()
