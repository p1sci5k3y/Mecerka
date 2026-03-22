import { ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import { WsJwtAuthGuard } from './ws-jwt-auth.guard';

describe('WsJwtAuthGuard', () => {
  let guard: WsJwtAuthGuard;
  let jwtServiceMock: { verifyAsync: jest.Mock };
  let configServiceMock: { get: jest.Mock };

  function buildGuard() {
    return Test.createTestingModule({
      providers: [
        WsJwtAuthGuard,
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();
  }

  function makeContext(overrides: {
    authorization?: string;
    queryToken?: string | string[];
  }): ExecutionContext {
    const client = {
      handshake: {
        headers: {
          authorization: overrides.authorization,
        },
        query: {
          token: overrides.queryToken,
        },
      },
      user: undefined as any,
    };

    return {
      switchToWs: () => ({
        getClient: () => client,
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(async () => {
    jwtServiceMock = {
      verifyAsync: jest
        .fn()
        .mockResolvedValue({ sub: 'user-1', roles: ['CLIENT'] }),
    };
    configServiceMock = {
      get: jest.fn().mockReturnValue('test-jwt-secret'),
    };

    const module: TestingModule = await buildGuard();
    guard = module.get<WsJwtAuthGuard>(WsJwtAuthGuard);
  });

  afterEach(() => jest.clearAllMocks());

  describe('constructor', () => {
    it('throws when JWT_SECRET is missing', async () => {
      configServiceMock.get.mockReturnValue(undefined);

      await expect(buildGuard()).rejects.toThrow(
        'JWT_SECRET configuration is missing',
      );
    });
  });

  describe('canActivate', () => {
    it('returns true when valid Bearer token is in Authorization header', async () => {
      const ctx = makeContext({ authorization: 'Bearer valid-token' });
      const result = await guard.canActivate(ctx);
      expect(result).toBe(true);
      expect(jwtServiceMock.verifyAsync).toHaveBeenCalledWith('valid-token', {
        secret: 'test-jwt-secret',
      });
    });

    it('returns true when valid token is in query string', async () => {
      const ctx = makeContext({ queryToken: 'query-token' });
      const result = await guard.canActivate(ctx);
      expect(result).toBe(true);
      expect(jwtServiceMock.verifyAsync).toHaveBeenCalledWith(
        'query-token',
        expect.any(Object),
      );
    });

    it('throws WsException when no token is provided', async () => {
      const ctx = makeContext({});
      await expect(guard.canActivate(ctx)).rejects.toThrow(WsException);
    });

    it('throws WsException when Authorization header type is not Bearer', async () => {
      // "Basic ..." should not extract a token
      const ctx = makeContext({ authorization: 'Basic sometoken' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(WsException);
    });

    it('throws WsException when JWT verification fails', async () => {
      jwtServiceMock.verifyAsync.mockRejectedValueOnce(
        new Error('invalid signature'),
      );
      const ctx = makeContext({ authorization: 'Bearer bad-token' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(WsException);
    });

    it('ignores array query token (non-string)', async () => {
      // When token is an array, extractTokenFromQuery returns undefined
      const ctx = makeContext({ queryToken: ['tok1', 'tok2'] });
      await expect(guard.canActivate(ctx)).rejects.toThrow(WsException);
    });
  });
});
