import { HttpException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { RequestLoggingInterceptor } from './request-logging.interceptor';
import { AppLoggerService } from './app-logger.service';

function buildHttpContext(overrides: {
  type?: string;
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
}) {
  const type = overrides.type ?? 'http';
  const request = overrides.request ?? {
    requestId: 'req-123',
    method: 'GET',
    originalUrl: '/test',
    user: { userId: 'user-1' },
  };
  const response = overrides.response ?? { statusCode: 200 };

  return {
    getType: jest.fn().mockReturnValue(type),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue(request),
      getResponse: jest.fn().mockReturnValue(response),
    }),
  };
}

describe('RequestLoggingInterceptor', () => {
  let interceptor: RequestLoggingInterceptor;
  let loggerMock: jest.Mocked<AppLoggerService>;

  beforeEach(() => {
    loggerMock = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    } as unknown as jest.Mocked<AppLoggerService>;

    interceptor = new RequestLoggingInterceptor(loggerMock);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('non-http context', () => {
    it('bypasses logging for non-http contexts', (done) => {
      const context = buildHttpContext({ type: 'rpc' });
      const next = { handle: jest.fn().mockReturnValue(of({ data: 'value' })) };

      interceptor.intercept(context as any, next as any).subscribe({
        next: (val) => {
          expect(val).toEqual({ data: 'value' });
          expect(loggerMock.log).not.toHaveBeenCalled();
          done();
        },
      });
    });

    it('bypasses logging for ws contexts', (done) => {
      const context = buildHttpContext({ type: 'ws' });
      const next = { handle: jest.fn().mockReturnValue(of(null)) };

      interceptor.intercept(context as any, next as any).subscribe({
        next: () => {
          expect(loggerMock.log).not.toHaveBeenCalled();
          done();
        },
      });
    });
  });

  describe('successful http requests', () => {
    it('logs http.request.completed on success with requestId and userId', (done) => {
      const context = buildHttpContext({});
      const next = { handle: jest.fn().mockReturnValue(of({ result: 'ok' })) };

      interceptor.intercept(context as any, next as any).subscribe({
        next: () => {
          expect(loggerMock.log).toHaveBeenCalledTimes(1);
          const logged = JSON.parse(loggerMock.log.mock.calls[0][0] as string);
          expect(logged.event).toBe('http.request.completed');
          expect(logged.requestId).toBe('req-123');
          expect(logged.userId).toBe('user-1');
          expect(logged.statusCode).toBe(200);
          expect(typeof logged.durationMs).toBe('number');
          done();
        },
      });
    });

    it('uses request.url when originalUrl is absent', (done) => {
      const context = buildHttpContext({
        request: {
          requestId: 'req-456',
          method: 'POST',
          url: '/fallback-url',
          user: { userId: 'user-2' },
        },
      });
      const next = { handle: jest.fn().mockReturnValue(of(null)) };

      interceptor.intercept(context as any, next as any).subscribe({
        next: () => {
          const logged = JSON.parse(loggerMock.log.mock.calls[0][0] as string);
          expect(logged.path).toBe('/fallback-url');
          done();
        },
      });
    });

    it('logs with undefined requestId when requestId is missing', (done) => {
      const context = buildHttpContext({
        request: {
          method: 'GET',
          originalUrl: '/no-request-id',
          user: { userId: 'user-1' },
        },
      });
      const next = { handle: jest.fn().mockReturnValue(of(null)) };

      interceptor.intercept(context as any, next as any).subscribe({
        next: () => {
          const logged = JSON.parse(loggerMock.log.mock.calls[0][0] as string);
          expect(logged.requestId).toBeUndefined();
          done();
        },
      });
    });

    it('logs with undefined userId when user is absent', (done) => {
      const context = buildHttpContext({
        request: {
          requestId: 'req-789',
          method: 'GET',
          originalUrl: '/no-user',
        },
      });
      const next = { handle: jest.fn().mockReturnValue(of(null)) };

      interceptor.intercept(context as any, next as any).subscribe({
        next: () => {
          const logged = JSON.parse(loggerMock.log.mock.calls[0][0] as string);
          expect(logged.userId).toBeUndefined();
          done();
        },
      });
    });
  });

  describe('failed http requests', () => {
    it('uses HttpException status code when error is an HttpException', (done) => {
      const httpError = new HttpException('Forbidden', 403);
      const context = buildHttpContext({});
      const next = {
        handle: jest.fn().mockReturnValue(throwError(() => httpError)),
      };

      interceptor.intercept(context as any, next as any).subscribe({
        error: () => {
          expect(loggerMock.error).toHaveBeenCalledTimes(1);
          const logged = JSON.parse(
            loggerMock.error.mock.calls[0][0] as string,
          );
          expect(logged.event).toBe('http.request.failed');
          expect(logged.statusCode).toBe(403);
          done();
        },
      });
    });

    it('uses response.statusCode when it is a 4xx and error is not HttpException', (done) => {
      const plainError = new Error('Bad stuff');
      const context = buildHttpContext({ response: { statusCode: 422 } });
      const next = {
        handle: jest.fn().mockReturnValue(throwError(() => plainError)),
      };

      interceptor.intercept(context as any, next as any).subscribe({
        error: () => {
          const logged = JSON.parse(
            loggerMock.error.mock.calls[0][0] as string,
          );
          expect(logged.statusCode).toBe(422);
          done();
        },
      });
    });

    it('falls back to 500 when error is not HttpException and statusCode is below 400', (done) => {
      const plainError = new Error('Crash');
      const context = buildHttpContext({ response: { statusCode: 200 } });
      const next = {
        handle: jest.fn().mockReturnValue(throwError(() => plainError)),
      };

      interceptor.intercept(context as any, next as any).subscribe({
        error: () => {
          const logged = JSON.parse(
            loggerMock.error.mock.calls[0][0] as string,
          );
          expect(logged.statusCode).toBe(500);
          done();
        },
      });
    });

    it('falls back to 500 when statusCode is not a number', (done) => {
      const plainError = new Error('Crash');
      const context = buildHttpContext({ response: {} });
      const next = {
        handle: jest.fn().mockReturnValue(throwError(() => plainError)),
      };

      interceptor.intercept(context as any, next as any).subscribe({
        error: () => {
          const logged = JSON.parse(
            loggerMock.error.mock.calls[0][0] as string,
          );
          expect(logged.statusCode).toBe(500);
          done();
        },
      });
    });

    it('logs requestId and userId in error path', (done) => {
      const httpError = new HttpException('Not Found', 404);
      const context = buildHttpContext({
        request: {
          requestId: 'req-err',
          method: 'DELETE',
          originalUrl: '/items/99',
          user: { userId: 'user-err' },
        },
      });
      const next = {
        handle: jest.fn().mockReturnValue(throwError(() => httpError)),
      };

      interceptor.intercept(context as any, next as any).subscribe({
        error: () => {
          const logged = JSON.parse(
            loggerMock.error.mock.calls[0][0] as string,
          );
          expect(logged.requestId).toBe('req-err');
          expect(logged.userId).toBe('user-err');
          expect(logged.method).toBe('DELETE');
          expect(logged.path).toBe('/items/99');
          done();
        },
      });
    });

    it('uses Unhandled request error message when error has no message', (done) => {
      const context = buildHttpContext({});
      const next = {
        handle: jest.fn().mockReturnValue(throwError(() => ({}))),
      };

      interceptor.intercept(context as any, next as any).subscribe({
        error: () => {
          const logged = JSON.parse(
            loggerMock.error.mock.calls[0][0] as string,
          );
          expect(logged.message).toBe('Unhandled request error');
          done();
        },
      });
    });

    it('re-throws the original error', (done) => {
      const originalError = new HttpException('Teapot', 418);
      const context = buildHttpContext({});
      const next = {
        handle: jest.fn().mockReturnValue(throwError(() => originalError)),
      };

      interceptor.intercept(context as any, next as any).subscribe({
        error: (err) => {
          expect(err).toBe(originalError);
          done();
        },
      });
    });
  });
});
