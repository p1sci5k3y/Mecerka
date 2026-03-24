import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { MfaCompleteGuard } from './mfa-complete.guard';

describe('MfaCompleteGuard', () => {
  const makeContext = (user: unknown): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  it('returns false when the request has no authenticated user', () => {
    const guard = new MfaCompleteGuard();

    expect(guard.canActivate(makeContext(undefined))).toBe(false);
  });

  it('throws when MFA is enabled but the session is not MFA-authenticated', () => {
    const guard = new MfaCompleteGuard();

    expect(() =>
      guard.canActivate(
        makeContext({
          userId: 'user-1',
          mfaEnabled: true,
          mfaAuthenticated: false,
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows access when MFA is disabled or already completed', () => {
    const guard = new MfaCompleteGuard();

    expect(
      guard.canActivate(
        makeContext({
          userId: 'user-1',
          mfaEnabled: false,
          mfaAuthenticated: false,
        }),
      ),
    ).toBe(true);
    expect(
      guard.canActivate(
        makeContext({
          userId: 'user-2',
          mfaEnabled: true,
          mfaAuthenticated: true,
        }),
      ),
    ).toBe(true);
  });
});
