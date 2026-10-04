import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common'
import { map, type Observable } from 'rxjs'
import type { ApiResponse } from '@nowoll/types'

// INTERCEPTOR: runs around every controller method. Controllers just
// `return product` and this wraps it as { success: true, data: product }.
// That keeps the envelope out of every single controller.
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    return next.handle().pipe(map((data) => ({ success: true, data })))
  }
}
