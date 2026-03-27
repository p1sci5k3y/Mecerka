import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MODULE_METADATA } from '@nestjs/common/constants';
jest.mock('./mfa.service', () => ({
  MfaService: class MfaService {},
}));

import { AuthModule } from './auth.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthEmailWorkflowService } from './auth-email-workflow.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { MfaService } from './mfa.service';

describe('AuthModule', () => {
  it('exports its controller/providers and builds JWT options from config', async () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      AuthModule,
    );
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      AuthModule,
    );
    const exportsMetadata = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      AuthModule,
    );
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AuthModule);
    const jwtDynamicModule = imports.find(
      (value: unknown) =>
        typeof value === 'object' &&
        value !== null &&
        'module' in value &&
        (value as { module: unknown }).module === JwtModule,
    ) as {
      providers?: Array<{ useFactory?: (...args: unknown[]) => unknown }>;
    };
    const jwtAsyncProvider = jwtDynamicModule.providers?.find(
      (provider) => typeof provider.useFactory === 'function',
    );

    expect(controllers).toEqual([AuthController]);
    expect(providers).toEqual(
      expect.arrayContaining([
        AuthService,
        AuthEmailWorkflowService,
        JwtStrategy,
        MfaService,
      ]),
    );
    expect(exportsMetadata).toEqual(
      expect.arrayContaining([AuthService, MfaService, JwtModule]),
    );
    expect(jwtAsyncProvider).toBeDefined();

    const configService = {
      get: jest.fn((key: string) =>
        key === 'JWT_SECRET' ? 'jwt-secret-value' : undefined,
      ),
    } as unknown as ConfigService;

    await expect(
      jwtAsyncProvider?.useFactory?.(configService),
    ).resolves.toEqual({
      secret: 'jwt-secret-value',
      signOptions: { expiresIn: '12h' },
    });
    await expect(
      jwtAsyncProvider?.useFactory?.({
        get: jest.fn(() => undefined),
      } as unknown as ConfigService),
    ).rejects.toThrow('JWT_SECRET configuration is missing');
  });
});
