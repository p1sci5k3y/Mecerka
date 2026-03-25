const createMockApp = () => {
  const httpInstance = { disable: jest.fn() };
  const httpAdapter = { getInstance: jest.fn(() => httpInstance) };
  return {
    useLogger: jest.fn(),
    get: jest.fn((token: unknown) => {
      if (token === 'APP_LOGGER') {
        return { log: jest.fn() };
      }
      return { httpAdapter: { adapter: true } };
    }),
    getHttpAdapter: jest.fn(() => httpAdapter),
    use: jest.fn(),
    useGlobalPipes: jest.fn(),
    useGlobalFilters: jest.fn(),
    enableCors: jest.fn(),
    listen: jest.fn().mockResolvedValue(undefined),
    __httpInstance: httpInstance,
  };
};

function expectCorsConfig(value: unknown): {
  origin: (origin: string | undefined, cb: jest.Mock) => void;
} {
  expect(value).toBeDefined();
  expect(value).toEqual(
    expect.objectContaining({
      origin: expect.any(Function),
    }),
  );

  return value as {
    origin: (origin: string | undefined, cb: jest.Mock) => void;
  };
}

function expectMiddleware(
  value: unknown,
): (req: unknown, res: { setHeader: jest.Mock }, next: jest.Mock) => void {
  expect(value).toEqual(expect.any(Function));
  return value as (
    req: unknown,
    res: { setHeader: jest.Mock },
    next: jest.Mock,
  ) => void;
}

describe('main bootstrap', () => {
  const env = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...env };
  });

  afterAll(() => {
    process.env = env;
  });

  it('bootstraps app and configures dev allowlist, permissive server-to-server origin, and blocked origins', async () => {
    const mockApp = createMockApp();
    const create = jest.fn().mockResolvedValue(mockApp);
    const cookieParser = jest.fn(() => 'cookie-middleware');
    const helmetBase = jest.fn(() => 'helmet-middleware');
    const helmetCsp = jest.fn(() => 'csp-middleware');

    process.env.NODE_ENV = 'development';
    delete process.env.FRONTEND_URL;
    delete process.env.PORT;

    jest.doMock('@nestjs/core', () => ({
      NestFactory: { create },
      HttpAdapterHost: class {},
    }));
    jest.doMock('./app.module', () => ({ AppModule: class AppModule {} }));
    jest.doMock('./common/logging/app-logger.service', () => ({
      AppLoggerService: 'APP_LOGGER',
    }));
    jest.doMock('./common/filters/prisma-client-exception.filter', () => ({
      PrismaClientExceptionFilter: jest.fn().mockImplementation(() => ({
        name: 'PrismaClientExceptionFilter',
      })),
    }));
    jest.doMock('cookie-parser', () => cookieParser);
    jest.doMock('helmet', () =>
      Object.assign(helmetBase, {
        contentSecurityPolicy: helmetCsp,
      }),
    );

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { bootstrap } = require('./main');
    await bootstrap();

    expect(create).toHaveBeenCalledWith(expect.any(Function), {
      rawBody: true,
    });
    expect(mockApp.__httpInstance.disable).toHaveBeenCalledWith('x-powered-by');
    expect(cookieParser).toHaveBeenCalled();
    expect(helmetBase).toHaveBeenCalled();
    expect(helmetCsp).toHaveBeenCalled();
    expect(mockApp.listen).toHaveBeenCalledWith(3000);

    const corsConfig = expectCorsConfig(mockApp.enableCors.mock.calls[0]?.[0]);
    const allow = jest.fn();
    const deny = jest.fn();
    corsConfig.origin(undefined, allow);
    corsConfig.origin('http://localhost:3000', allow);
    corsConfig.origin('http://evil.test', deny);

    expect(allow).toHaveBeenNthCalledWith(1, null, true);
    expect(allow).toHaveBeenNthCalledWith(2, null, true);
    expect(deny).toHaveBeenCalledWith(
      new Error('CORS blocked for origin: http://evil.test'),
      false,
    );

    const permissionsMiddleware = expectMiddleware(
      mockApp.use.mock.calls[3]?.[0],
    );
    const res = { setHeader: jest.fn() };
    const next = jest.fn();
    permissionsMiddleware({}, res, next);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );
    expect(next).toHaveBeenCalled();
  });

  it('allows configured frontend origin in production and honors explicit PORT', async () => {
    const mockApp = createMockApp();
    const create = jest.fn().mockResolvedValue(mockApp);
    const cookieParser = jest.fn(() => 'cookie-middleware');
    const helmetBase = jest.fn(() => 'helmet-middleware');
    const helmetCsp = jest.fn(() => 'csp-middleware');

    process.env.NODE_ENV = 'production';
    process.env.FRONTEND_URL = 'https://mecerka.example';
    process.env.PORT = '4010';

    jest.doMock('@nestjs/core', () => ({
      NestFactory: { create },
      HttpAdapterHost: class {},
    }));
    jest.doMock('./app.module', () => ({ AppModule: class AppModule {} }));
    jest.doMock('./common/logging/app-logger.service', () => ({
      AppLoggerService: 'APP_LOGGER',
    }));
    jest.doMock('./common/filters/prisma-client-exception.filter', () => ({
      PrismaClientExceptionFilter: jest.fn().mockImplementation(() => ({
        name: 'PrismaClientExceptionFilter',
      })),
    }));
    jest.doMock('cookie-parser', () => cookieParser);
    jest.doMock('helmet', () =>
      Object.assign(helmetBase, {
        contentSecurityPolicy: helmetCsp,
      }),
    );

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { bootstrap } = require('./main');
    await bootstrap();

    expect(mockApp.listen).toHaveBeenCalledWith('4010');

    const corsConfig = expectCorsConfig(mockApp.enableCors.mock.calls[0]?.[0]);
    const allow = jest.fn();
    corsConfig.origin('https://mecerka.example', allow);
    expect(allow).toHaveBeenCalledWith(null, true);
  });
});
