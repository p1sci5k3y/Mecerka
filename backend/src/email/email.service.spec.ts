import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from './email.service';

describe('EmailService', () => {
  let service: EmailService;

  beforeEach(async () => {
    // NODE_ENV=test so jsonTransport is used — no real SMTP needed
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailService],
    }).compile();

    service = module.get<EmailService>(EmailService);
  });

  describe('sendVerificationEmail', () => {
    it('sends a verification email using default FRONTEND_URL when env var is absent', async () => {
      const original = process.env.FRONTEND_URL;
      delete process.env.FRONTEND_URL;

      const info = await service.sendVerificationEmail(
        'user@example.com',
        'tok123',
      );
      expect(info).toBeDefined();

      process.env.FRONTEND_URL = original;
    });

    it('sends a verification email using the configured FRONTEND_URL', async () => {
      process.env.FRONTEND_URL = 'https://mecerka.app';

      const info = await service.sendVerificationEmail(
        'user@example.com',
        'tok456',
      );
      expect(info).toBeDefined();

      delete process.env.FRONTEND_URL;
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('sends a password reset email using default FRONTEND_URL', async () => {
      const original = process.env.FRONTEND_URL;
      delete process.env.FRONTEND_URL;

      const info = await service.sendPasswordResetEmail(
        'user@example.com',
        'reset-tok',
      );
      expect(info).toBeDefined();

      process.env.FRONTEND_URL = original;
    });

    it('sends a password reset email using configured FRONTEND_URL', async () => {
      process.env.FRONTEND_URL = 'https://mecerka.app';

      const info = await service.sendPasswordResetEmail(
        'user@example.com',
        'reset-tok2',
      );
      expect(info).toBeDefined();

      delete process.env.FRONTEND_URL;
    });
  });

  describe('sendMfaSetupEmail', () => {
    it('sends an MFA setup email for a valid 6-digit code', async () => {
      const info = await service.sendMfaSetupEmail(
        'user@example.com',
        '123456',
      );
      expect(info).toBeDefined();
    });

    it('throws for a code that is not exactly 6 digits', async () => {
      await expect(
        service.sendMfaSetupEmail('user@example.com', 'abcdef'),
      ).rejects.toThrow('Invalid MFA code format');
    });

    it('throws for a code shorter than 6 digits', async () => {
      await expect(
        service.sendMfaSetupEmail('user@example.com', '12345'),
      ).rejects.toThrow('Invalid MFA code format');
    });
  });

  describe('sendEmail', () => {
    it('delivers a generic HTML email', async () => {
      const info = await service.sendEmail(
        'recipient@example.com',
        'Test Subject',
        '<p>Hello</p>',
      );
      expect(info).toBeDefined();
    });

    it('uses the default MAIL_FROM when env var is absent', async () => {
      const original = process.env.MAIL_FROM;
      delete process.env.MAIL_FROM;

      const info = await service.sendEmail(
        'someone@example.com',
        'Subject',
        '<p>body</p>',
      );
      expect(info).toBeDefined();

      process.env.MAIL_FROM = original;
    });
  });

  describe('maskEmail edge cases (covered via sendEmail)', () => {
    it('handles email with no @ character', async () => {
      // The private maskEmail returns '***' for invalid emails, but sendEmail still
      // passes the raw address to nodemailer; just verify it does not throw.
      const info = await service.sendEmail(
        'invalidemail',
        'Subject',
        '<p>x</p>',
      );
      expect(info).toBeDefined();
    });

    it('handles email that starts with @ (no local part)', async () => {
      const info = await service.sendEmail(
        '@domain.com',
        'Subject',
        '<p>x</p>',
      );
      expect(info).toBeDefined();
    });

    it('handles email with missing domain after @', async () => {
      const info = await service.sendEmail('local@', 'Subject', '<p>x</p>');
      expect(info).toBeDefined();
    });
  });

  describe('constructor non-test transport', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('configures secure authenticated SMTP in production when credentials exist', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.E2E;
      process.env.MAIL_HOST = 'smtp.example.com';
      process.env.MAIL_PORT = '465';
      process.env.MAIL_USER = 'mailer';
      process.env.MAIL_PASS = 'secret';
      process.env.MAIL_FROM = '"Prod" <prod@example.com>';

      const prodService = new EmailService();
      const transporterOptions = (prodService as any).transporter.options;

      expect(transporterOptions).toEqual({
        host: 'smtp.example.com',
        port: 465,
        secure: true,
        auth: { user: 'mailer', pass: 'secret' },
        tls: { rejectUnauthorized: true },
      });
    });

    it('configures unauthenticated non-secure SMTP outside production', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.E2E;
      delete process.env.MAIL_HOST;
      process.env.MAIL_PORT = '1025';
      delete process.env.MAIL_USER;
      delete process.env.MAIL_PASS;

      const devService = new EmailService();
      const transporterOptions = (devService as any).transporter.options;

      expect(transporterOptions).toEqual({
        host: 'mailpit',
        port: 1025,
        secure: false,
        auth: undefined,
        tls: { rejectUnauthorized: false },
      });
    });

    it('uses test transport when E2E mode is enabled', () => {
      process.env.NODE_ENV = 'development';
      process.env.E2E = 'true';

      const e2eService = new EmailService();
      const transporterOptions = (e2eService as any).transporter.options;

      expect(transporterOptions).toEqual({ jsonTransport: true });
    });
  });
});
