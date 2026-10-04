import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  StreamableFile,
} from '@nestjs/common'
import { map, type Observable } from 'rxjs'
import type { ApiResponse } from '@nowoll/types'

// INTERCEPTOR: runs around every controller method. Controllers just
// `return product` and this wraps it as { success: true, data: product }.
// That keeps the envelope out of every single controller.
// File downloads (StreamableFile, e.g. the CSV export) are passed through
// untouched — wrapping a file in JSON would corrupt it.
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T> | StreamableFile> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T> | StreamableFile> {
    return next
      .handle()
      .pipe(map((data) => (data instanceof StreamableFile ? data : { success: true, data })))
  }
}
