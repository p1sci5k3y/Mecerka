import { ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { E2eAwareThrottlerGuard } from './e2e-throttler.guard';

describe('E2eAwareThrottlerGuard', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('bypasses throttling during e2e runs', async () => {
    process.env.E2E = 'true';
    const guard = new E2eAwareThrottlerGuard(
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      guard.canActivate({} as unknown as ExecutionContext),
    ).resolves.toBe(true);
  });

  it('bypasses throttling in test mode', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.E2E;
    const guard = new E2eAwareThrottlerGuard(
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      guard.canActivate({} as unknown as ExecutionContext),
    ).resolves.toBe(true);
  });

  it('delegates to the parent guard outside test modes', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.E2E;
    const parentSpy = jest
      .spyOn(ThrottlerGuard.prototype, 'canActivate')
      .mockResolvedValueOnce(false);
    const guard = new E2eAwareThrottlerGuard(
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      guard.canActivate({} as unknown as ExecutionContext),
    ).resolves.toBe(false);
    expect(parentSpy).toHaveBeenCalled();
  });
});
