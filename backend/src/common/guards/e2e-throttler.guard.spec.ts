import { ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { E2eAwareThrottlerGuard } from './e2e-throttler.guard';

describe('E2eAwareThrottlerGuard', () => {
  const env = process.env;
  const context = {} as ExecutionContext;

  beforeEach(() => {
    process.env = { ...env };
  });

  afterAll(() => {
    process.env = env;
  });

  it('bypasses throttling in E2E and test environments', async () => {
    const guard = new E2eAwareThrottlerGuard(
      undefined as never,
      undefined as never,
      undefined as never,
    );

    process.env.E2E = 'true';
    await expect(guard.canActivate(context)).resolves.toBe(true);

    delete process.env.E2E;
    process.env.NODE_ENV = 'test';
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('delegates to the Nest throttler guard outside test contexts', async () => {
    const parentPrototype = Object.getPrototypeOf(
      E2eAwareThrottlerGuard.prototype,
    ) as ThrottlerGuard;
    const parentSpy = jest
      .spyOn(parentPrototype, 'canActivate')
      .mockResolvedValue(true);
    const guard = new E2eAwareThrottlerGuard(
      undefined as never,
      undefined as never,
      undefined as never,
    );

    process.env.NODE_ENV = 'production';
    delete process.env.E2E;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(parentSpy).toHaveBeenCalledWith(context);
  });
});
