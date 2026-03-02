import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { PrismaClientExceptionFilter } from './common/filters/prisma-client-exception.filter';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

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

  // Content Security Policy is disabled temporarily to permit integration with externally hosted frontend scripts and assets during MVP phase.
  // XSS risks are mitigated via strict generic Helmet configurations and React frontend sanitization.
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );
  app.enableCors();
  await app.listen(process.env.PORT ?? 3000);
}
// eslint-disable-next-line unicorn/prefer-top-level-await
void bootstrap();
