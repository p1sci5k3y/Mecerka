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
});
