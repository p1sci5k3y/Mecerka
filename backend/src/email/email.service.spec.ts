import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from './email.service';

// Ensure we're in test transport mode
process.env.NODE_ENV = 'test';

describe('EmailService', () => {
  let service: EmailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailService],
    }).compile();

    service = module.get<EmailService>(EmailService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendVerificationEmail', () => {
    it('sends an email with the verification link', async () => {
      const sendEmailSpy = jest
        .spyOn(service, 'sendEmail')
        .mockResolvedValue(undefined as any);

      await service.sendVerificationEmail('user@test.com', 'token-abc');

      expect(sendEmailSpy).toHaveBeenCalledWith(
        'user@test.com',
        expect.stringContaining('Verifica'),
        expect.stringContaining('token-abc'),
      );
    });

    it('uses FRONTEND_URL env variable when set', async () => {
      const originalFrontendUrl = process.env.FRONTEND_URL;
      process.env.FRONTEND_URL = 'https://myapp.example.com';

      const sendEmailSpy = jest
        .spyOn(service, 'sendEmail')
        .mockResolvedValue(undefined as any);

      await service.sendVerificationEmail('user@test.com', 'tok123');

      expect(sendEmailSpy).toHaveBeenCalledWith(
        'user@test.com',
        expect.anything(),
        expect.stringContaining('https://myapp.example.com'),
      );

      process.env.FRONTEND_URL = originalFrontendUrl;
    });

    it('falls back to localhost when FRONTEND_URL is not set', async () => {
      const originalFrontendUrl = process.env.FRONTEND_URL;
      delete process.env.FRONTEND_URL;

      const sendEmailSpy = jest
        .spyOn(service, 'sendEmail')
        .mockResolvedValue(undefined as any);

      await service.sendVerificationEmail('user@test.com', 'tok123');

      expect(sendEmailSpy).toHaveBeenCalledWith(
        'user@test.com',
        expect.anything(),
        expect.stringContaining('localhost'),
      );

      process.env.FRONTEND_URL = originalFrontendUrl;
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('sends a reset email with the token in the link', async () => {
      const sendEmailSpy = jest
        .spyOn(service, 'sendEmail')
        .mockResolvedValue(undefined as any);

      await service.sendPasswordResetEmail('user@test.com', 'reset-tok');

      expect(sendEmailSpy).toHaveBeenCalledWith(
        'user@test.com',
        expect.stringContaining('contraseña'),
        expect.stringContaining('reset-tok'),
      );
    });

    it('falls back to localhost when FRONTEND_URL is not set', async () => {
      const originalFrontendUrl = process.env.FRONTEND_URL;
      delete process.env.FRONTEND_URL;

      const sendEmailSpy = jest
        .spyOn(service, 'sendEmail')
        .mockResolvedValue(undefined as any);

      await service.sendPasswordResetEmail('user@test.com', 'tok');

      expect(sendEmailSpy).toHaveBeenCalledWith(
        'user@test.com',
        expect.anything(),
        expect.stringContaining('localhost'),
      );

      process.env.FRONTEND_URL = originalFrontendUrl;
    });
  });

  describe('sendMfaSetupEmail', () => {
    it('throws when code is not 6 digits', async () => {
      await expect(
        service.sendMfaSetupEmail('user@test.com', '12345'),
      ).rejects.toThrow('Invalid MFA code format');

      await expect(
        service.sendMfaSetupEmail('user@test.com', 'abcdef'),
      ).rejects.toThrow('Invalid MFA code format');
    });

    it('sends MFA setup email with valid 6-digit code', async () => {
      const sendEmailSpy = jest
        .spyOn(service, 'sendEmail')
        .mockResolvedValue(undefined as any);

      await service.sendMfaSetupEmail('user@test.com', '123456');

      expect(sendEmailSpy).toHaveBeenCalledWith(
        'user@test.com',
        expect.stringContaining('MFA'),
        expect.stringContaining('123456'),
      );
    });
  });

  describe('sendEmail', () => {
    it('sends email via transporter', async () => {
      // EmailService in test mode uses jsonTransport - it logs but still works
      // We test that the method resolves without error
      await expect(
        service.sendEmail('user@test.com', 'Test Subject', '<p>Test Body</p>'),
      ).resolves.toBeDefined();
    });
  });
});
