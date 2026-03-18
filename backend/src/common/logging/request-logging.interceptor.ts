import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { AppLoggerService } from './app-logger.service';
import type { RequestWithRequestId } from './request-id.middleware';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<RequestWithRequestId>();
    const response = httpContext.getResponse<{ statusCode?: number }>();
    const startedAt = Date.now();

    const baseLog = {
      event: 'http.request.completed',
      requestId: request.requestId,
      method: request.method,
      path: request.originalUrl ?? request.url,
      userId: request.user?.userId,
    };

    return next.handle().pipe(
      tap(() => {
        this.logger.log(
          JSON.stringify({
            ...baseLog,
            statusCode: response.statusCode,
            durationMs: Date.now() - startedAt,
          }),
        );
      }),
      catchError((error: unknown) => {
        const maybeError = error as { message?: string; stack?: string };
        const statusCode =
          error instanceof HttpException
            ? error.getStatus()
            : typeof response.statusCode === 'number' &&
                response.statusCode >= 400
              ? response.statusCode
              : 500;
        this.logger.error(
          JSON.stringify({
            event: 'http.request.failed',
            requestId: request.requestId,
            method: request.method,
            path: request.originalUrl ?? request.url,
            userId: request.user?.userId,
            statusCode,
            durationMs: Date.now() - startedAt,
            message: maybeError?.message ?? 'Unhandled request error',
          }),
          maybeError?.stack,
        );
        return throwError(() => error);
      }),
    );
  }
}
