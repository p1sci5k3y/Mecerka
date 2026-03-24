import { RequestIdMiddleware } from './request-id.middleware';

describe('RequestIdMiddleware', () => {
  let middleware: RequestIdMiddleware;

  beforeEach(() => {
    middleware = new RequestIdMiddleware();
  });

  it('reuses a safe incoming request id', () => {
    const req = {
      header: jest.fn().mockReturnValue('safe-request-id'),
    } as any;
    const res = { setHeader: jest.fn() } as any;
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.requestId).toBe('safe-request-id');
    expect(res.setHeader).toHaveBeenCalledWith(
      'X-Request-ID',
      'safe-request-id',
    );
    expect(next).toHaveBeenCalled();
  });

  it('generates a new request id when the incoming one is invalid', () => {
    const req = {
      header: jest.fn().mockReturnValue('bad value with spaces'),
    } as any;
    const res = { setHeader: jest.fn() } as any;
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', req.requestId);
    expect(next).toHaveBeenCalled();
  });
});
