import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../interfaces/auth.interfaces';
import { Role } from '@prisma/client';
import * as jwt from 'jsonwebtoken';

describe('JwtStrategy.validate', () => {
  let strategy: JwtStrategy;
  let prismaMock: any;

  beforeEach(async () => {
    // Provide minimal JWT env vars so the strategy constructor does not blow up
    process.env.JWT_SECRET_CURRENT = 'test-secret';

    prismaMock = {
      user: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const getSecretProvider = () =>
    (
      strategy as unknown as {
        _secretOrKeyProvider: (
          request: unknown,
          rawJwtToken: string,
          done: (err: unknown, secret?: string) => void,
        ) => void;
      }
    )._secretOrKeyProvider;

  const getJwtExtractor = () =>
    (
      strategy as unknown as {
        _jwtFromRequest: (request: unknown) => string | null;
      }
    )._jwtFromRequest;

  const baseUser = {
    active: true,
    emailVerified: true,
    roles: [Role.CLIENT],
    tokenVersion: 1,
    mfaEnabled: false,
    passwordChangedAt: null,
  };

  const basePayload: JwtPayload = {
    sub: 'user-1',
    roles: [Role.CLIENT],
    tokenVersion: 1,
    iat: Math.floor(Date.now() / 1000) - 10,
  };

  it('returns a valid UserFromJwt for an active user', async () => {
    prismaMock.user.findUnique.mockResolvedValue(baseUser);

    const result = await strategy.validate(basePayload);

    expect(result).toEqual({
      userId: 'user-1',
      roles: [Role.CLIENT],
      mfaEnabled: false,
      mfaAuthenticated: true, // mfaEnabled=false → mfaAuthenticated defaults to true
    });
  });

  it('throws UnauthorizedException when user is not found', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(strategy.validate(basePayload)).rejects.toThrow(
      new UnauthorizedException('User not found'),
    );
  });

  it('throws UnauthorizedException when user account is suspended', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...baseUser,
      active: false,
    });

    await expect(strategy.validate(basePayload)).rejects.toThrow(
      new UnauthorizedException('User account is suspended'),
    );
  });

  it('throws UnauthorizedException when token version is outdated', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...baseUser,
      tokenVersion: 5,
    });

    const payload: JwtPayload = { ...basePayload, tokenVersion: 3 };

    await expect(strategy.validate(payload)).rejects.toThrow(
      new UnauthorizedException('Token revoked'),
    );
  });

  it('does NOT throw when payload tokenVersion equals user tokenVersion', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...baseUser,
      tokenVersion: 2,
    });

    const payload: JwtPayload = { ...basePayload, tokenVersion: 2 };
    const result = await strategy.validate(payload);

    expect(result.userId).toBe('user-1');
  });

  it('does NOT throw when payload has no tokenVersion', async () => {
    prismaMock.user.findUnique.mockResolvedValue(baseUser);

    const { tokenVersion: _omit, ...payloadWithoutVersion } = basePayload;
    const result = await strategy.validate(payloadWithoutVersion as JwtPayload);

    expect(result.userId).toBe('user-1');
  });

  it('throws when token was issued before password change', async () => {
    const changedAt = new Date(Date.now() - 5000); // changed 5s ago
    prismaMock.user.findUnique.mockResolvedValue({
      ...baseUser,
      passwordChangedAt: changedAt,
    });

    // iat 30s ago, passwordChangedAt 5s ago → token is stale
    const payload: JwtPayload = {
      ...basePayload,
      iat: Math.floor(Date.now() / 1000) - 30,
    };

    await expect(strategy.validate(payload)).rejects.toThrow(
      new UnauthorizedException('Token expired due to password change'),
    );
  });

  it('does NOT throw when token was issued after password change', async () => {
    const changedAt = new Date(Date.now() - 60_000); // changed 60s ago
    prismaMock.user.findUnique.mockResolvedValue({
      ...baseUser,
      passwordChangedAt: changedAt,
    });

    // iat 10s ago, so token is newer than the password change
    const payload: JwtPayload = {
      ...basePayload,
      iat: Math.floor(Date.now() / 1000) - 10,
    };

    const result = await strategy.validate(payload);
    expect(result.userId).toBe('user-1');
  });

  it('uses payload.mfaAuthenticated when explicitly provided', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...baseUser,
      mfaEnabled: true,
    });

    const payload: JwtPayload = { ...basePayload, mfaAuthenticated: true };
    const result = await strategy.validate(payload);

    expect(result.mfaAuthenticated).toBe(true);
  });

  it('sets mfaAuthenticated to false when mfaEnabled=true and payload has no flag', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...baseUser,
      mfaEnabled: true,
    });

    const { mfaAuthenticated: _omit, ...payloadWithout } = {
      ...basePayload,
      mfaAuthenticated: undefined,
    };

    const result = await strategy.validate(payloadWithout as JwtPayload);
    // mfaAuthenticated = payload.mfaAuthenticated ?? !user.mfaEnabled = undefined ?? false = false
    expect(result.mfaAuthenticated).toBe(false);
  });

  it('extracts JWTs from cookies and falls back to bearer tokens', () => {
    const extractor = getJwtExtractor();

    expect(
      extractor({
        cookies: { access_token: 'cookie-token' },
        headers: {},
      }),
    ).toBe('cookie-token');
    expect(
      extractor({
        headers: { authorization: 'Bearer header-token' },
      }),
    ).toBe('header-token');
    expect(extractor({ headers: {} })).toBeNull();
  });

  it('fails fast when no JWT secret configuration exists', () => {
    delete process.env.JWT_SECRET_CURRENT;
    delete process.env.JWT_SECRET;
    delete process.env.JWT_SECRET_PREVIOUS;

    const secretProvider = getSecretProvider();
    const done = jest.fn();

    secretProvider(null, 'raw-token', done);

    expect(done).toHaveBeenCalledWith(
      new Error('JWT_SECRET configuration is missing'),
      undefined,
    );
  });

  it('falls back to the previous secret when the current one fails verification', () => {
    process.env.JWT_SECRET_CURRENT = 'current-secret';
    process.env.JWT_SECRET_PREVIOUS = 'previous-secret';
    const token = jwt.sign({ sub: 'user-1' }, 'previous-secret');
    const secretProvider = getSecretProvider();
    const done = jest.fn();

    secretProvider(null, token, done);

    expect(done).toHaveBeenCalledWith(null, 'previous-secret');
  });

  it('returns the verification error when both current and previous secrets fail', () => {
    process.env.JWT_SECRET_CURRENT = 'current-secret';
    process.env.JWT_SECRET_PREVIOUS = 'previous-secret';
    const token = jwt.sign({ sub: 'user-1' }, 'totally-different-secret');
    const secretProvider = getSecretProvider();
    const done = jest.fn();

    secretProvider(null, token, done);

    expect(done.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect(done.mock.calls[0]?.[1]).toBeUndefined();
  });
});
