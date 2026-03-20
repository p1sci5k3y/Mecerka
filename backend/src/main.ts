import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { PrismaClientExceptionFilter } from './common/filters/prisma-client-exception.filter';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppLoggerService } from './common/logging/app-logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.useLogger(app.get(AppLoggerService));
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.use(cookieParser());

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Exception Filtering
  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new PrismaClientExceptionFilter(httpAdapter as any));

  // Content Security Policy is enabled with default safe directives to mitigate XSS
  app.use(helmet());

  const isDev = process.env.NODE_ENV !== 'production';
  const frontendUrl = process.env.FRONTEND_URL;

  const allowlist = new Set<string>();
  if (isDev) allowlist.add('http://localhost:3000');
  if (isDev) allowlist.add('http://localhost:3001');
  if (frontendUrl) allowlist.add(frontendUrl);

  app.enableCors({
    origin: (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => {
      // origin can be undefined in server-to-server calls or curl
      if (!origin) return cb(null, true);

      if (allowlist.has(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Idempotency-Key',
      'idempotency-key',
      'X-Request-ID',
    ],
  });
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
