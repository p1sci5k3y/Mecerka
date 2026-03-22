import { Test, TestingModule } from '@nestjs/testing';
import { MfaService } from './mfa.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

// Mock the qrcode module so no real image generation happens
jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,fake'),
}));

// Mock otplib to avoid ESM issues with @scure/base (ESM-only package).
// The TOTP constructor is called at module-load time, so we must return a
// stable stub that tests can later configure via its .verify mock.
jest.mock('otplib', () => {
  // These fn references are evaluated inside the factory, which runs before
  // any module code, so we cannot use outer `mockVerify` etc. here directly.
  // Instead, return a TOTP class whose instances delegate to the
  // per-method spies we define above — but since factories are hoisted we
  // use the module-level jest.fn() replacements via the __esModule trick.
  const verifyFn = jest.fn().mockResolvedValue({ valid: false });
  const generateSecretFn = jest.fn().mockReturnValue('MOCKEDSECRET');
  const toURIFn = jest.fn().mockReturnValue('otpauth://totp/user@example.com');
  const instance = {
    verify: verifyFn,
    generateSecret: generateSecretFn,
    toURI: toURIFn,
  };
  return {
    TOTP: jest.fn().mockImplementation(() => instance),
    NobleCryptoPlugin: jest.fn(),
    ScureBase32Plugin: jest.fn(),
    __instance: instance,
  };
});

// Helper to grab the shared totp stub after mocks are set up
function getTotpStub() {
  const otplib = jest.requireMock<{
    __instance: {
      verify: jest.Mock;
      generateSecret: jest.Mock;
      toURI: jest.Mock;
    };
  }>('otplib');
  return otplib.__instance;
}

describe('MfaService', () => {
  let service: MfaService;
  let prismaMock: any;
  let emailServiceMock: any;
  let totpStub: ReturnType<typeof getTotpStub>;

  beforeEach(async () => {
    totpStub = getTotpStub();
    jest.clearAllMocks();

    // Restore default behaviors after clearAllMocks
    totpStub.generateSecret.mockReturnValue('MOCKEDSECRET');
    totpStub.toURI.mockReturnValue('otpauth://totp/user@example.com');
    totpStub.verify.mockResolvedValue({ valid: false });

    prismaMock = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    emailServiceMock = {
      sendEmail: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MfaService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EmailService, useValue: emailServiceMock },
      ],
    }).compile();

    service = module.get<MfaService>(MfaService);
  });

  describe('generateMfaSecret', () => {
    it('returns secret, otpauthUrl and qrCode', async () => {
      const result = await service.generateMfaSecret(
        'user-1',
        'user@example.com',
      );

      expect(result).toHaveProperty('secret', 'MOCKEDSECRET');
      expect(result).toHaveProperty('otpauthUrl');
      expect(result).toHaveProperty('qrCode');
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({ mfaEnabled: false }),
        }),
      );
    });

    it('logs error but does not throw when email sending fails', async () => {
      emailServiceMock.sendEmail.mockRejectedValueOnce(new Error('SMTP down'));

      const result = await service.generateMfaSecret(
        'user-2',
        'fail@example.com',
      );
      expect(result).toHaveProperty('secret');
    });
  });

  describe('verifyMfaToken', () => {
    it('returns false when user is not found (null)', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const result = await service.verifyMfaToken('missing-user', '123456');
      expect(result).toBe(false);
    });

    it('returns false when user has no mfaSecret', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        mfaSecret: null,
        mfaLockUntil: null,
        mfaFailedAttempts: 0,
      });

      const result = await service.verifyMfaToken('user-1', '123456');
      expect(result).toBe(false);
    });

    it('returns false when user is locked out (mfaLockUntil in the future)', async () => {
      const futureDate = new Date(Date.now() + 15 * 60 * 1000);
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        mfaSecret: 'SOMEBASE32SECRET',
        mfaLockUntil: futureDate,
        mfaFailedAttempts: 5,
      });

      const result = await service.verifyMfaToken('user-1', '000000');
      expect(result).toBe(false);
      // Should not attempt verification when locked
      expect(totpStub.verify).not.toHaveBeenCalled();
    });

    it('increments failed attempts when token is invalid', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        mfaSecret: 'JBSWY3DPEHPK3PXP',
        mfaLockUntil: null,
        mfaFailedAttempts: 0,
      });
      totpStub.verify.mockResolvedValue({ valid: false });

      const result = await service.verifyMfaToken('user-1', '000000');
      expect(result).toBe(false);
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({ mfaFailedAttempts: 1 }),
        }),
      );
    });

    it('sets lockUntil when failed attempts reach 5', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        mfaSecret: 'JBSWY3DPEHPK3PXP',
        mfaLockUntil: null,
        mfaFailedAttempts: 4, // 5th attempt will trigger lock
      });
      totpStub.verify.mockResolvedValue({ valid: false });

      await service.verifyMfaToken('user-1', '000000');

      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mfaFailedAttempts: 5,
            mfaLockUntil: expect.any(Date),
          }),
        }),
      );
    });

    it('returns true and resets failed attempts on valid token', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        mfaSecret: 'JBSWY3DPEHPK3PXP',
        mfaLockUntil: null,
        mfaFailedAttempts: 2,
      });
      totpStub.verify.mockResolvedValue({ valid: true });

      const result = await service.verifyMfaToken('user-1', '123456');
      expect(result).toBe(true);
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mfaEnabled: true,
            mfaFailedAttempts: 0,
          }),
        }),
      );
    });

    it('returns false and handles internal TOTP errors gracefully', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        mfaSecret: 'JBSWY3DPEHPK3PXP',
        mfaLockUntil: null,
        mfaFailedAttempts: 0,
      });
      totpStub.verify.mockRejectedValueOnce(new Error('TOTP internal error'));

      // Should not throw — returns false on any exception
      const result = await service.verifyMfaToken('user-1', '000000');
      expect(result).toBe(false);
    });
  });
});
