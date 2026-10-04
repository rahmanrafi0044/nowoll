import { type CallHandler, type ExecutionContext, StreamableFile } from '@nestjs/common'
import { firstValueFrom, of } from 'rxjs'
import { ResponseInterceptor } from './response.interceptor.js'

describe('ResponseInterceptor', () => {
  it('wraps whatever the controller returns in { success: true, data }', async () => {
    const next: CallHandler = { handle: () => of({ id: 1, name: 'Shirt' }) }
    const result = await firstValueFrom(
      new ResponseInterceptor().intercept({} as ExecutionContext, next),
    )
    expect(result).toEqual({ success: true, data: { id: 1, name: 'Shirt' } })
  })

  it('passes file downloads through unwrapped', async () => {
    const file = new StreamableFile(Buffer.from('a,b\n'))
    const next: CallHandler = { handle: () => of(file) }
    const result = await firstValueFrom(
      new ResponseInterceptor().intercept({} as ExecutionContext, next),
    )
    expect(result).toBe(file)
  })
})
