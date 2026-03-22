import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';
import { Role } from '@prisma/client';

// Prevent loading of ESM-only otplib dependency used by MfaService
jest.mock('./mfa.service', () => ({
  MfaService: jest.fn().mockImplementation(() => ({
    generateMfaSecret: jest.fn(),
    verifyMfaToken: jest.fn(),
  })),
}));

describe('AuthController', () => {
  let controller: AuthController;
  let authServiceMock: jest.Mocked<Partial<AuthService>>;
  let mfaServiceMock: jest.Mocked<Partial<MfaService>>;

  const mockResponse = () => {
    const res: any = {};
    res.cookie = jest.fn().mockReturnValue(res);
    res.clearCookie = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(async () => {
    authServiceMock = {
      register: jest.fn(),
      login: jest.fn(),
      logout: jest.fn(),
      findById: jest.fn(),
      verifyEmail: jest.fn(),
      resendVerificationEmail: jest.fn(),
      forgotPassword: jest.fn(),
      verifyResetToken: jest.fn(),
      resetPassword: jest.fn(),
      generateMfaSetupOtp: jest.fn(),
      clearMfaSetupOtp: jest.fn(),
      generateMfaCompleteToken: jest.fn(),
    };

    mfaServiceMock = {
      generateMfaSecret: jest.fn(),
      verifyMfaToken: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: MfaService, useValue: mfaServiceMock },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── register ────────────────────────────────────────────────────────────

  describe('register', () => {
    it('happy path – returns created user', async () => {
      const dto = {
        email: 'user@test.com',
        password: 'Pass1234!',
        name: 'Test User',
      };
      const created = { id: 'u1', email: dto.email, name: dto.name };
      (authServiceMock.register as jest.Mock).mockResolvedValue(created);

      const result = await controller.register(dto as any);

      expect(authServiceMock.register).toHaveBeenCalledWith(dto);
      expect(result).toEqual(created);
    });
  });

  // ─── login ────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('happy path – sets cookie and returns token/user', async () => {
      const dto = { email: 'user@test.com', password: 'Pass1234!' };
      const loginResponse = { access_token: 'jwt-token', user: { id: 'u1' } };
      (authServiceMock.login as jest.Mock).mockResolvedValue(loginResponse);
      const res = mockResponse();

      const result = await controller.login(dto as any, res);

      expect(authServiceMock.login).toHaveBeenCalledWith(dto);
      expect(res.cookie).toHaveBeenCalledWith(
        'access_token',
        'jwt-token',
        expect.objectContaining({ httpOnly: true }),
      );
      expect(result).toEqual(loginResponse);
    });

    it('invalid credentials – propagates UnauthorizedException', async () => {
      const dto = { email: 'user@test.com', password: 'WrongPass!' };
      (authServiceMock.login as jest.Mock).mockRejectedValue(
        new UnauthorizedException('Invalid credentials'),
      );
      const res = mockResponse();

      await expect(controller.login(dto as any, res)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ─── me ──────────────────────────────────────────────────────────────────

  describe('getProfile', () => {
    it('returns profile of authenticated user', async () => {
      const user = {
        id: 'u1',
        email: 'user@test.com',
        name: 'Test User',
        roles: [Role.CLIENT],
        mfaEnabled: false,
        pin: null,
        stripeAccountId: null,
      };
      (authServiceMock.findById as jest.Mock).mockResolvedValue(user);
      const req: any = { user: { userId: 'u1', roles: [Role.CLIENT] } };

      const result = await controller.getProfile(req);

      expect(authServiceMock.findById).toHaveBeenCalledWith('u1');
      expect(result).toEqual({
        userId: 'u1',
        email: user.email,
        name: user.name,
        roles: user.roles,
        mfaEnabled: user.mfaEnabled,
        hasPin: false,
        stripeAccountId: null,
      });
    });

    it('throws BadRequestException when user not found', async () => {
      (authServiceMock.findById as jest.Mock).mockResolvedValue(null);
      const req: any = { user: { userId: 'u999', roles: [] } };

      await expect(controller.getProfile(req)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── logout ───────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('clears cookie and returns confirmation', async () => {
      const logoutResult = { message: 'Logged out successfully' };
      (authServiceMock.logout as jest.Mock).mockResolvedValue(logoutResult);
      const req: any = { user: { userId: 'u1' } };
      const res = mockResponse();

      const result = await controller.logout(req, res);

      expect(res.clearCookie).toHaveBeenCalledWith(
        'access_token',
        expect.objectContaining({ httpOnly: true }),
      );
      expect(authServiceMock.logout).toHaveBeenCalledWith('u1');
      expect(result).toEqual(logoutResult);
    });
  });

  // ─── verifyEmail ──────────────────────────────────────────────────────────

  describe('verifyEmail', () => {
    it('returns verification result when token is provided', async () => {
      const verifyResult = { message: 'Email verified' };
      (authServiceMock.verifyEmail as jest.Mock).mockResolvedValue(
        verifyResult,
      );

      const result = await controller.verifyEmail('valid-token');

      expect(authServiceMock.verifyEmail).toHaveBeenCalledWith('valid-token');
      expect(result).toEqual(verifyResult);
    });

    it('throws BadRequestException when token is missing', async () => {
      await expect(controller.verifyEmail(undefined as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('resendVerificationEmail', () => {
    it('delegates to authService', async () => {
      (authServiceMock.resendVerificationEmail as jest.Mock).mockResolvedValue({
        message: 'Resent',
      });

      const result = await controller.resendVerificationEmail({
        email: 'user@test.com',
      } as any);

      expect(authServiceMock.resendVerificationEmail).toHaveBeenCalledWith(
        'user@test.com',
      );
      expect(result).toEqual({ message: 'Resent' });
    });
  });

  describe('forgotPassword', () => {
    it('delegates to authService', async () => {
      (authServiceMock.forgotPassword as jest.Mock).mockResolvedValue({
        message: 'Reset email sent',
      });

      const result = await controller.forgotPassword({
        email: 'user@test.com',
      } as any);

      expect(authServiceMock.forgotPassword).toHaveBeenCalledWith(
        'user@test.com',
      );
      expect(result).toEqual({ message: 'Reset email sent' });
    });
  });

  describe('verifyResetTokenEndpoint', () => {
    it('throws BadRequestException when token is missing', async () => {
      await expect(
        controller.verifyResetTokenEndpoint(undefined as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns valid:true when token is provided', async () => {
      (authServiceMock.verifyResetToken as jest.Mock).mockResolvedValue({
        user: { id: 'u1' },
      });

      const result = await controller.verifyResetTokenEndpoint('reset-token');

      expect(authServiceMock.verifyResetToken).toHaveBeenCalledWith(
        'reset-token',
      );
      expect(result).toEqual({ valid: true });
    });
  });

  describe('resetPassword', () => {
    it('delegates to authService', async () => {
      (authServiceMock.resetPassword as jest.Mock).mockResolvedValue({
        message: 'Password reset',
      });

      const result = await controller.resetPassword({
        token: 'tk',
        newPassword: 'NewPass1!',
      } as any);

      expect(authServiceMock.resetPassword).toHaveBeenCalledWith(
        'tk',
        'NewPass1!',
      );
      expect(result).toEqual({ message: 'Password reset' });
    });
  });

  describe('generateMfaEmailOtp', () => {
    it('throws BadRequestException when user is not found', async () => {
      (authServiceMock.findById as jest.Mock).mockResolvedValue(null);
      const req: any = { user: { userId: 'u999' } };

      await expect(controller.generateMfaEmailOtp(req)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns success when user exists', async () => {
      (authServiceMock.findById as jest.Mock).mockResolvedValue({
        id: 'u1',
        email: 'u@test.com',
      });
      (authServiceMock.generateMfaSetupOtp as jest.Mock).mockResolvedValue(
        undefined,
      );
      const req: any = { user: { userId: 'u1' } };

      const result = await controller.generateMfaEmailOtp(req);

      expect(result).toEqual({ success: true, message: 'OTP sent to email' });
    });
  });

  describe('setupMfa', () => {
    it('throws BadRequestException when user is not found', async () => {
      (authServiceMock.findById as jest.Mock).mockResolvedValue(null);
      const req: any = { user: { userId: 'u999' } };

      await expect(controller.setupMfa(req, 'code123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when otpCode is missing', async () => {
      (authServiceMock.findById as jest.Mock).mockResolvedValue({
        id: 'u1',
        mfaSetupToken: 'code123',
        mfaSetupExpiresAt: new Date(Date.now() + 60000),
      });
      const req: any = { user: { userId: 'u1' } };

      await expect(controller.setupMfa(req, '' as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when otpCode does not match token', async () => {
      (authServiceMock.findById as jest.Mock).mockResolvedValue({
        id: 'u1',
        mfaSetupToken: 'correct-code',
        mfaSetupExpiresAt: new Date(Date.now() + 60000),
      });
      const req: any = { user: { userId: 'u1' } };

      await expect(controller.setupMfa(req, 'wrong-code')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when mfaSetupExpiresAt is null', async () => {
      (authServiceMock.findById as jest.Mock).mockResolvedValue({
        id: 'u1',
        mfaSetupToken: 'code123',
        mfaSetupExpiresAt: null,
      });
      const req: any = { user: { userId: 'u1' } };

      await expect(controller.setupMfa(req, 'code123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when OTP is expired', async () => {
      (authServiceMock.findById as jest.Mock).mockResolvedValue({
        id: 'u1',
        mfaSetupToken: 'code123',
        mfaSetupExpiresAt: new Date(Date.now() - 1000), // in the past
      });
      const req: any = { user: { userId: 'u1' } };

      await expect(controller.setupMfa(req, 'code123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('calls clearMfaSetupOtp and generateMfaSecret when OTP is valid', async () => {
      const futureDate = new Date(Date.now() + 60000);
      (authServiceMock.findById as jest.Mock).mockResolvedValue({
        id: 'u1',
        email: 'u@test.com',
        mfaSetupToken: 'code123',
        mfaSetupExpiresAt: futureDate,
      });
      (authServiceMock.clearMfaSetupOtp as jest.Mock).mockResolvedValue(
        undefined,
      );
      (mfaServiceMock.generateMfaSecret as jest.Mock).mockResolvedValue({
        secret: 'TOTP_SECRET',
        qrCode: 'data:image/png;base64,...',
      });
      const req: any = { user: { userId: 'u1', roles: [Role.CLIENT] } };

      const result = await controller.setupMfa(req, 'code123');

      expect(authServiceMock.clearMfaSetupOtp).toHaveBeenCalledWith('u1');
      expect(mfaServiceMock.generateMfaSecret).toHaveBeenCalledWith(
        'u1',
        'u@test.com',
      );
      expect(result).toEqual({
        secret: 'TOTP_SECRET',
        qrCode: 'data:image/png;base64,...',
      });
    });
  });

  describe('verifyMfa', () => {
    it('throws BadRequestException when MFA token is invalid', async () => {
      (mfaServiceMock.verifyMfaToken as jest.Mock).mockResolvedValue(false);
      const req: any = { user: { userId: 'u1' } };
      const res = mockResponse();

      await expect(
        controller.verifyMfa(req, { token: 'bad-token' } as any, res),
      ).rejects.toThrow(BadRequestException);
    });

    it('sets cookie and returns auth response when MFA token is valid', async () => {
      (mfaServiceMock.verifyMfaToken as jest.Mock).mockResolvedValue(true);
      (authServiceMock.generateMfaCompleteToken as jest.Mock).mockResolvedValue(
        { access_token: 'mfa-jwt' },
      );
      const req: any = { user: { userId: 'u1' } };
      const res = mockResponse();

      const result = await controller.verifyMfa(
        req,
        { token: 'good-token' } as any,
        res,
      );

      expect(res.cookie).toHaveBeenCalledWith(
        'access_token',
        'mfa-jwt',
        expect.objectContaining({ httpOnly: true }),
      );
      expect(result).toEqual({ access_token: 'mfa-jwt' });
    });
  });

  describe('getProfile - hasPin branch', () => {
    it('returns hasPin true when user has a pin', async () => {
      (authServiceMock.findById as jest.Mock).mockResolvedValue({
        id: 'u1',
        email: 'u@test.com',
        name: 'User',
        roles: [Role.CLIENT],
        mfaEnabled: true,
        pin: 'hashed-pin',
        stripeAccountId: null,
      });
      const req: any = { user: { userId: 'u1' } };

      const result = await controller.getProfile(req);

      expect(result.hasPin).toBe(true);
    });
  });
});
