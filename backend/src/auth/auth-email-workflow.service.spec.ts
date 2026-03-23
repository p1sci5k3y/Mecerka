import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AuthEmailWorkflowService } from './auth-email-workflow.service';

describe('AuthEmailWorkflowService', () => {
  let service: AuthEmailWorkflowService;
  let prismaMock: {
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let emailMock: {
    sendVerificationEmail: jest.Mock;
    sendPasswordResetEmail: jest.Mock;
  };

  beforeEach(async () => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    emailMock = {
      sendVerificationEmail: jest.fn(),
      sendPasswordResetEmail: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthEmailWorkflowService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EmailService, useValue: emailMock },
      ],
    }).compile();

    service = module.get<AuthEmailWorkflowService>(AuthEmailWorkflowService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('verifies a valid email token', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      verificationTokenExpiresAt: new Date(Date.now() + 60_000),
    });
    prismaMock.user.update.mockResolvedValue({});

    const result = await service.verifyEmail('valid-token');

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { emailVerified: true, verificationToken: null },
    });
    expect(result).toEqual({ message: 'Cuenta verificada con éxito.' });
  });

  it('returns a non-enumerating response when resend target does not exist', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const result = await service.resendVerificationEmail('x@example.test');

    expect(result.message).toContain('Si el correo existe');
  });

  it('resends verification after persisting a new token', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.test',
        emailVerified: false,
      })
      .mockResolvedValueOnce({ lastEmailSentAt: null });
    prismaMock.user.update.mockResolvedValue({});
    emailMock.sendVerificationEmail.mockResolvedValue(undefined);

    const result = await service.resendVerificationEmail('user@example.test');

    expect(prismaMock.user.update).toHaveBeenCalled();
    expect(emailMock.sendVerificationEmail).toHaveBeenCalledWith(
      'user@example.test',
      expect.any(String),
    );
    expect(result.message).toContain('Si el correo existe');
  });

  it('creates a password reset token before sending the email', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.test',
      })
      .mockResolvedValueOnce({ lastEmailSentAt: null });
    prismaMock.user.update.mockResolvedValue({});
    emailMock.sendPasswordResetEmail.mockResolvedValue(undefined);

    const result = await service.forgotPassword('user@example.test');

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resetPasswordTokenHash: expect.any(String),
          resetPasswordExpiresAt: expect.any(Date),
        }),
      }),
    );
    expect(emailMock.sendPasswordResetEmail).toHaveBeenCalledWith(
      'user@example.test',
      expect.any(String),
    );
    expect(result.message).toContain('Si el correo existe');
  });

  it('rejects expired reset tokens', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      resetPasswordExpiresAt: new Date(Date.now() - 1000),
    });

    await expect(service.verifyResetToken('expired-token')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('resets the password for a valid token', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      resetPasswordExpiresAt: new Date(Date.now() + 60_000),
    });
    prismaMock.user.update.mockResolvedValue({});

    const result = await service.resetPassword(
      'valid-token',
      'StrongPassword#123',
    );

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          password: expect.any(String),
          resetPasswordTokenHash: null,
          resetPasswordExpiresAt: null,
        }),
      }),
    );
    expect(result).toEqual({
      message: 'Tu contraseña ha sido restablecida con éxito.',
    });
  });
});
