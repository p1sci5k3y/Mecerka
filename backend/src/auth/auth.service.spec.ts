import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { EmailService } from '../email/email.service';
import { AuthEmailWorkflowService } from './auth-email-workflow.service';

describe('AuthService.register', () => {
  let service: AuthService;
  let prismaMock: {
    user: {
      findUnique: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let emailServiceMock: { sendVerificationEmail: jest.Mock };

  beforeEach(async () => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    emailServiceMock = { sendVerificationEmail: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        AuthEmailWorkflowService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: { sign: jest.fn() } },
        { provide: EmailService, useValue: emailServiceMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('always creates CLIENT users at registration', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        user: {
          create: jest.fn().mockResolvedValue({
            id: 'user-1',
            email: 'user@example.test',
          }),
        },
      }),
    );
    emailServiceMock.sendVerificationEmail.mockResolvedValue(undefined);

    await expect(
      service.register({
        email: 'user@example.test',
        password: 'StrongPassword#123',
        name: 'Alice',
      }),
    ).resolves.toEqual({
      message:
        'Cuenta creada. Por favor, revisa tu correo para verificar tu cuenta.',
    });

    const txArg = prismaMock.$transaction.mock.calls[0]![0];
    const createMock = jest.fn().mockResolvedValue({
      id: 'user-1',
      email: 'user@example.test',
    });
    await txArg({ user: { create: createMock } });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          roles: [Role.CLIENT],
        }),
      }),
    );
  });

  it('does not allow role escalation through register payload', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        user: {
          create: jest.fn().mockResolvedValue({
            id: 'user-2',
            email: 'attacker@example.test',
          }),
        },
      }),
    );
    emailServiceMock.sendVerificationEmail.mockResolvedValue(undefined);

    const payload = {
      email: 'attacker@example.test',
      password: 'StrongPassword#123',
      name: 'Mallory',
      role: Role.ADMIN,
    };

    await expect(service.register(payload as any)).resolves.toEqual({
      message:
        'Cuenta creada. Por favor, revisa tu correo para verificar tu cuenta.',
    });
  });

  it('throws ConflictException when user already exists', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'existing-user' });

    await expect(
      service.register({
        email: 'existing@example.test',
        password: 'StrongPassword#123',
        name: 'Existing',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('throws BadRequestException when DB transaction fails', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockRejectedValue(new Error('DB error'));

    await expect(
      service.register({
        email: 'user@example.test',
        password: 'StrongPassword#123',
        name: 'Alice',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('succeeds even when sendVerificationEmail throws (logs warning but does not rethrow)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        user: {
          create: jest.fn().mockResolvedValue({
            id: 'user-3',
            email: 'user@example.test',
          }),
        },
      }),
    );
    emailServiceMock.sendVerificationEmail.mockRejectedValue(
      new Error('SMTP error'),
    );

    await expect(
      service.register({
        email: 'user@example.test',
        password: 'StrongPassword#123',
        name: 'Alice',
      }),
    ).resolves.toEqual({
      message:
        'Cuenta creada. Por favor, revisa tu correo para verificar tu cuenta.',
    });
  });

  it('uses email prefix as name when name is not provided', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const createMock = jest.fn().mockResolvedValue({
      id: 'user-4',
      email: 'prefix@example.test',
    });
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({ user: { create: createMock } }),
    );
    emailServiceMock.sendVerificationEmail.mockResolvedValue(undefined);

    await service.register({
      email: 'prefix@example.test',
      password: 'StrongPassword#123',
      name: '',
    });

    // Rerun callback to inspect create args
    const txArg = prismaMock.$transaction.mock.calls[0]![0];
    const inspectMock = jest.fn().mockResolvedValue({
      id: 'user-4',
      email: 'prefix@example.test',
    });
    await txArg({ user: { create: inspectMock } });
    expect(inspectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'prefix' }),
      }),
    );
  });
});

describe('AuthService – branch coverage', () => {
  let service: AuthService;
  let prismaMock: any;
  let jwtMock: any;
  let emailMock: any;

  beforeEach(async () => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    jwtMock = { sign: jest.fn().mockReturnValue('signed-token') };
    emailMock = {
      sendVerificationEmail: jest.fn(),
      sendPasswordResetEmail: jest.fn(),
      sendMfaSetupEmail: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        AuthEmailWorkflowService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: EmailService, useValue: emailMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── forgotPassword ─────────────────────────────────────────────────────

  describe('forgotPassword', () => {
    it('returns generic message when user does not exist (anti-enumeration)', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword('nobody@example.test');

      expect(result).toEqual({
        message:
          'Si el correo existe, recibirás un enlace para restablecer tu contraseña.',
      });
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('sends reset email and returns generic message on success', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce({
          id: 'u-1',
          email: 'user@example.test',
          lastEmailSentAt: null,
        })
        // checkEmailRateLimit inner call
        .mockResolvedValueOnce({ lastEmailSentAt: null });
      prismaMock.user.update.mockResolvedValue({});
      emailMock.sendPasswordResetEmail.mockResolvedValue(undefined);

      const result = await service.forgotPassword('user@example.test');

      expect(emailMock.sendPasswordResetEmail).toHaveBeenCalled();
      expect(result).toEqual({
        message:
          'Si el correo existe, recibirás un enlace para restablecer tu contraseña.',
      });
    });

    it('throws BadRequestException when email sending fails', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce({
          id: 'u-2',
          email: 'user@example.test',
          lastEmailSentAt: null,
        })
        .mockResolvedValueOnce({ lastEmailSentAt: null });
      prismaMock.user.update.mockResolvedValue({});
      emailMock.sendPasswordResetEmail.mockRejectedValue(new Error('SMTP err'));

      await expect(service.forgotPassword('user@example.test')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when email rate limit is not yet passed', async () => {
      const recentTime = new Date(Date.now() - 30 * 1000); // 30 sec ago < 90 sec limit
      prismaMock.user.findUnique
        .mockResolvedValueOnce({
          id: 'u-3',
          email: 'user@example.test',
          lastEmailSentAt: recentTime,
        })
        .mockResolvedValueOnce({ lastEmailSentAt: recentTime });

      await expect(service.forgotPassword('user@example.test')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── verifyEmail ────────────────────────────────────────────────────────

  describe('verifyEmail', () => {
    it('verifies successfully when token is valid and not expired', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u-1',
        verificationToken: 'valid-token',
        verificationTokenExpiresAt: new Date(Date.now() + 60_000),
      });
      prismaMock.user.update.mockResolvedValue({});

      const result = await service.verifyEmail('valid-token');

      expect(result).toEqual({ message: 'Cuenta verificada con éxito.' });
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ emailVerified: true }),
        }),
      );
    });

    it('throws BadRequestException when token not found (user is null)', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.verifyEmail('bad-token')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when token is expired', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u-1',
        verificationToken: 'expired-token',
        verificationTokenExpiresAt: new Date(Date.now() - 1),
      });

      await expect(service.verifyEmail('expired-token')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when verificationTokenExpiresAt is null', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u-1',
        verificationToken: 'some-token',
        verificationTokenExpiresAt: null,
      });

      await expect(service.verifyEmail('some-token')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── login ──────────────────────────────────────────────────────────────

  describe('login', () => {
    it('throws UnauthorizedException when user not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'noone@example.test', password: 'pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when email not verified', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u-1',
        email: 'user@example.test',
        password: 'hashed',
        emailVerified: false,
        roles: [Role.CLIENT],
        mfaEnabled: false,
        pin: null,
        tokenVersion: 1,
      });

      await expect(
        service.login({ email: 'user@example.test', password: 'any' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── logout ─────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('returns success:false when user not found', async () => {
      prismaMock.user.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.logout('nonexistent-user');

      expect(result).toEqual({
        success: false,
        message: 'Usuario no encontrado',
      });
    });

    it('returns success:true when user is found', async () => {
      prismaMock.user.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.logout('existing-user');

      expect(result).toEqual({
        success: true,
        message: 'Logged out successfully',
      });
    });
  });

  // ─── verifyResetToken ───────────────────────────────────────────────────

  describe('verifyResetToken', () => {
    it('throws BadRequestException when token is invalid (user not found)', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.verifyResetToken('bad-token')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when token is expired', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u-1',
        resetPasswordExpiresAt: new Date(Date.now() - 1),
      });

      await expect(service.verifyResetToken('expired-token')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns user when token is valid and not expired', async () => {
      const user = {
        id: 'u-1',
        resetPasswordExpiresAt: new Date(Date.now() + 3600_000),
      };
      prismaMock.user.findUnique.mockResolvedValue(user);

      const result = await service.verifyResetToken('valid-token');

      expect(result).toEqual(user);
    });
  });

  // ─── resendVerificationEmail ─────────────────────────────────────────────

  describe('resendVerificationEmail', () => {
    it('returns generic message when user not found (anti-enumeration)', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const result = await service.resendVerificationEmail('x@example.test');

      expect(result.message).toContain('Si el correo existe');
    });

    it('returns generic message when email already verified', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u-1',
        email: 'user@example.test',
        emailVerified: true,
      });

      const result = await service.resendVerificationEmail('user@example.test');

      expect(result.message).toContain('Si el correo existe');
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when DB update fails', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce({
          id: 'u-1',
          email: 'user@example.test',
          emailVerified: false,
          lastEmailSentAt: null,
        })
        .mockResolvedValueOnce({ lastEmailSentAt: null });
      prismaMock.user.update.mockRejectedValue(new Error('DB fail'));

      await expect(
        service.resendVerificationEmail('user@example.test'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when email fails to send', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce({
          id: 'u-1',
          email: 'user@example.test',
          emailVerified: false,
          lastEmailSentAt: null,
        })
        .mockResolvedValueOnce({ lastEmailSentAt: null });
      prismaMock.user.update.mockResolvedValue({});
      emailMock.sendVerificationEmail.mockRejectedValue(new Error('SMTP'));

      await expect(
        service.resendVerificationEmail('user@example.test'),
      ).rejects.toThrow(BadRequestException);
    });

    it('sends verification email successfully', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce({
          id: 'u-1',
          email: 'user@example.test',
          emailVerified: false,
          lastEmailSentAt: null,
        })
        .mockResolvedValueOnce({ lastEmailSentAt: null });
      prismaMock.user.update.mockResolvedValue({});
      emailMock.sendVerificationEmail.mockResolvedValue(undefined);

      const result = await service.resendVerificationEmail('user@example.test');

      expect(emailMock.sendVerificationEmail).toHaveBeenCalled();
      expect(result.message).toContain('Si el correo existe');
    });
  });

  // ─── findById ───────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns null when user not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const result = await service.findById('missing-id');

      expect(result).toBeNull();
    });

    it('returns user profile when found', async () => {
      const user = {
        id: 'u-1',
        email: 'user@example.test',
        name: 'Alice',
        roles: [Role.CLIENT],
        mfaEnabled: false,
        pin: null,
        stripeAccountId: null,
        mfaSetupToken: null,
        mfaSetupExpiresAt: null,
      };
      prismaMock.user.findUnique.mockResolvedValue(user);

      const result = await service.findById('u-1');

      expect(result).toEqual(user);
    });
  });

  // ─── generateMfaCompleteToken ────────────────────────────────────────────

  describe('generateMfaCompleteToken', () => {
    it('throws UnauthorizedException when user not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        service.generateMfaCompleteToken('missing-id'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns token when user exists', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        email: 'u@example.test',
        roles: [Role.CLIENT],
        tokenVersion: 1,
      });

      const result = await service.generateMfaCompleteToken('u-1');

      expect(result).toMatchObject({
        success: true,
        access_token: 'signed-token',
        mfaAuthenticated: true,
      });
    });
  });
});
