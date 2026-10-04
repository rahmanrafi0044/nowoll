import { BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common'
import type { ArgumentsHost } from '@nestjs/common'
import { Prisma } from '@nowoll/database'
import { AllExceptionsFilter } from './all-exceptions.filter.js'

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('db error', { code, clientVersion: 'test' })
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter()

  it('maps an HttpException to its status and an error code', () => {
    expect(filter.toErrorShape(new NotFoundException('Product not found'))).toEqual({
      status: 404,
      error: 'NOT_FOUND',
      message: 'Product not found',
    })
  })

  it('joins ValidationPipe messages into one readable VALIDATION_ERROR', () => {
    const ex = new BadRequestException({
      message: ['email must be an email', 'phone should not be empty'],
    })
    expect(filter.toErrorShape(ex)).toEqual({
      status: 400,
      error: 'VALIDATION_ERROR',
      message: 'email must be an email; phone should not be empty',
    })
  })

  it('passes through a list of details when a service provides one', () => {
    const ex = new BadRequestException({
      message: '2 problems',
      details: ['Row 2: bad', 'Row 5: worse'],
    })
    expect(filter.toErrorShape(ex)).toEqual({
      status: 400,
      error: 'BAD_REQUEST',
      message: '2 problems',
      details: ['Row 2: bad', 'Row 5: worse'],
    })
  })

  it('maps a Prisma unique-constraint error (P2002) to 409 CONFLICT', () => {
    expect(filter.toErrorShape(prismaError('P2002')).status).toBe(HttpStatus.CONFLICT)
  })

  it('maps a Prisma record-not-found error (P2025) to 404', () => {
    expect(filter.toErrorShape(prismaError('P2025')).status).toBe(HttpStatus.NOT_FOUND)
  })

  it('hides internal details of unexpected errors behind a generic 500', () => {
    const shape = filter.toErrorShape(new Error('connection to 10.0.0.5 refused, password=hunter2'))
    expect(shape.status).toBe(500)
    expect(shape.message).not.toContain('hunter2')
  })

  it('writes the { success: false, error, message } envelope to the response', () => {
    const json = vi.fn()
    const status = vi.fn(() => ({ json }))
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost

    filter.catch(new NotFoundException('Nope'), host)

    expect(status).toHaveBeenCalledWith(404)
    expect(json).toHaveBeenCalledWith({ success: false, error: 'NOT_FOUND', message: 'Nope' })
  })
})
