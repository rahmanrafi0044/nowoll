import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { Prisma } from '@nowoll/database'
import type { Response } from 'express'
import type { ApiResponse } from '../types/api-response.js'

interface ErrorShape {
  status: number
  error: string
  message: string
}

// GLOBAL EXCEPTION FILTER: every error thrown anywhere in the API ends up here
// and is turned into the same { success: false, error, message } shape.
// Two jobs:
//   1. Consistency — the frontend handles every failure the same way.
//   2. Safety — unexpected errors (bugs, DB crashes) never leak stack traces,
//      SQL or internal details to the browser. They're logged server-side instead.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>()
    const { status, error, message } = this.toErrorShape(exception)

    if (status >= 500) {
      // TODO(phase 7): also report to Sentry here.
      this.logger.error(
        message,
        exception instanceof Error ? exception.stack : JSON.stringify(exception),
      )
    }

    const body: ApiResponse = { success: false, error, message }
    response.status(status).json(body)
  }

  toErrorShape(exception: unknown): ErrorShape {
    if (exception instanceof HttpException) {
      return this.fromHttpException(exception)
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrismaError(exception)
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    }
  }

  private fromHttpException(exception: HttpException): ErrorShape {
    const status = exception.getStatus()
    const res = exception.getResponse()
    const raw = typeof res === 'string' ? res : (res as { message?: string | string[] }).message

    // ValidationPipe reports every invalid field as an array of messages.
    if (Array.isArray(raw)) {
      return { status, error: 'VALIDATION_ERROR', message: raw.join('; ') }
    }

    return {
      status,
      error: HttpStatus[status] ?? 'ERROR', // 404 → "NOT_FOUND", 429 → "TOO_MANY_REQUESTS"
      message: raw ?? exception.message,
    }
  }

  // Prisma error codes: https://www.prisma.io/docs/orm/reference/error-reference
  private fromPrismaError(exception: Prisma.PrismaClientKnownRequestError): ErrorShape {
    switch (exception.code) {
      case 'P2002': // unique constraint, e.g. duplicate slug or SKU
        return {
          status: HttpStatus.CONFLICT,
          error: 'CONFLICT',
          message: 'A record with this value already exists.',
        }
      case 'P2025': // record to update/delete not found
        return { status: HttpStatus.NOT_FOUND, error: 'NOT_FOUND', message: 'Record not found.' }
      default:
        this.logger.error(`Unhandled Prisma error ${exception.code}`, exception.stack)
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'INTERNAL_SERVER_ERROR',
          message: 'Something went wrong. Please try again.',
        }
    }
  }
}
