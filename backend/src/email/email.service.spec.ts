import { Test, TestingModule } from '@nestjs/testing';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { EmailService } from './email.service';

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: jest.fn(),
  },
  createTransport: jest.fn(),
}));

jest.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ MessageId: 'ses-message-1' }),
  })),
  SendEmailCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

describe('EmailService', () => {
  let service: EmailService;
  const createTransportMock = (
    jest.requireMock('nodemailer') as { createTransport: jest.Mock }
  ).createTransport;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    createTransportMock.mockReset();
    createTransportMock.mockReturnValue({
      sendMail: jest.fn().mockResolvedValue({ messageId: 'smtp-message-1' }),
    } as any);
    (SESv2Client as jest.Mock).mockClear();
    (SendEmailCommand as unknown as jest.Mock).mockClear();

    // NODE_ENV=test so jsonTransport is used — no real SMTP needed
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailService],
    }).compile();

    service = module.get<EmailService>(EmailService);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
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

    it('routes non-test delivery through SMTP when the active connector is SMTP', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.E2E;

      const smtpSendMail = jest.fn().mockResolvedValue({ messageId: 'smtp-2' });
      createTransportMock.mockReturnValueOnce({
        sendMail: smtpSendMail,
      } as any);

      const smtpService = new EmailService({
        getRuntimeSettings: jest.fn().mockResolvedValue({
          connectorType: 'SMTP',
          source: 'database',
          host: 'smtp.example.com',
          port: 587,
          user: 'mailer',
          pass: 'secret',
          from: 'ops@example.com',
        }),
      } as any);

      await expect(
        smtpService.sendEmail(
          'recipient@example.com',
          'Subject',
          '<p>Body</p>',
        ),
      ).resolves.toEqual({ messageId: 'smtp-2' });

      expect(createTransportMock).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        requireTLS: true,
        auth: { user: 'mailer', pass: 'secret' },
        tls: {
          rejectUnauthorized: true,
          minVersion: 'TLSv1.2',
          servername: 'smtp.example.com',
        },
        from: 'ops@example.com',
      });
      expect(smtpSendMail).toHaveBeenCalledWith({
        from: 'ops@example.com',
        to: 'recipient@example.com',
        subject: 'Subject',
        html: '<p>Body</p>',
      });
    });

    it('routes non-test delivery through AWS SES and falls back to aws-ses message ids', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.E2E;

      const sendMock = jest.fn().mockResolvedValue({});
      (SESv2Client as jest.Mock).mockImplementationOnce(() => ({
        send: sendMock,
      }));

      const sesService = new EmailService({
        getRuntimeSettings: jest.fn().mockResolvedValue({
          connectorType: 'AWS_SES',
          source: 'database',
          region: 'eu-west-1',
          accessKeyId: 'AKIA123',
          secretAccessKey: 'secret-123',
          sessionToken: null,
          endpoint: 'https://email.eu-west-1.amazonaws.com',
          from: 'ses@example.com',
        }),
      } as any);

      await expect(
        sesService.sendEmail('recipient@example.com', 'Subject', '<p>Body</p>'),
      ).resolves.toEqual({ messageId: 'aws-ses' });

      expect(SESv2Client).toHaveBeenCalledWith({
        region: 'eu-west-1',
        endpoint: 'https://email.eu-west-1.amazonaws.com',
        credentials: {
          accessKeyId: 'AKIA123',
          secretAccessKey: 'secret-123',
          sessionToken: undefined,
        },
      });
      expect(SendEmailCommand as unknown as jest.Mock).toHaveBeenCalled();
      expect(sendMock).toHaveBeenCalledTimes(1);
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
    it('configures secure authenticated SMTP in production when credentials exist', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.E2E;
      process.env.MAIL_HOST = 'smtp.example.com';
      process.env.MAIL_PORT = '465';
      process.env.MAIL_USER = 'mailer';
      process.env.MAIL_PASS = 'secret';
      process.env.MAIL_FROM = '"Prod" <prod@example.com>';

      const prodService = new EmailService();

      return expect(
        (prodService as any).buildTransportOptions(),
      ).resolves.toEqual({
        host: 'smtp.example.com',
        port: 465,
        secure: true,
        requireTLS: true,
        auth: { user: 'mailer', pass: 'secret' },
        tls: {
          rejectUnauthorized: true,
          minVersion: 'TLSv1.2',
          servername: 'smtp.example.com',
        },
        from: '"Prod" <prod@example.com>',
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

      return expect(
        (devService as any).buildTransportOptions(),
      ).resolves.toEqual({
        host: 'mailpit',
        port: 1025,
        secure: false,
        requireTLS: false,
        auth: undefined,
        tls: { rejectUnauthorized: false },
        from: '"Mecerka" <no-reply@mecerka.local>',
      });
    });

    it('uses test transport when E2E mode is enabled', () => {
      process.env.NODE_ENV = 'development';
      process.env.E2E = 'true';

      const e2eService = new EmailService();

      return expect(
        (e2eService as any).buildTransportOptions(),
      ).resolves.toEqual({ jsonTransport: true });
    });

    it('prefers persisted SMTP settings over environment variables when available', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.E2E;
      process.env.MAIL_HOST = 'smtp.env.example.com';
      process.env.MAIL_PORT = '587';
      process.env.MAIL_USER = 'env-user';
      process.env.MAIL_PASS = 'env-pass';
      process.env.MAIL_FROM = 'env@example.com';

      const serviceWithStored = new EmailService({
        getRuntimeSettings: jest.fn().mockResolvedValue({
          host: 'email-smtp.eu-west-1.amazonaws.com',
          port: 465,
          user: 'db-user',
          pass: 'db-pass',
          from: 'db@example.com',
          source: 'database',
        }),
      } as any);

      return expect(
        (serviceWithStored as any).buildTransportOptions(),
      ).resolves.toEqual({
        host: 'email-smtp.eu-west-1.amazonaws.com',
        port: 465,
        secure: true,
        requireTLS: true,
        auth: { user: 'db-user', pass: 'db-pass' },
        tls: {
          rejectUnauthorized: true,
          minVersion: 'TLSv1.2',
          servername: 'email-smtp.eu-west-1.amazonaws.com',
        },
        from: 'db@example.com',
      });
    });

    it('builds an AWS SES connector payload when the persisted connector is SES', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.E2E;

      const serviceWithSes = new EmailService({
        getRuntimeSettings: jest.fn().mockResolvedValue({
          connectorType: 'AWS_SES',
          region: 'eu-west-1',
          accessKeyId: 'AKIA123',
          secretAccessKey: 'secret-123',
          sessionToken: 'session-123',
          endpoint: null,
          from: 'ses@example.com',
          source: 'database',
        }),
      } as any);

      return expect(
        (serviceWithSes as any).buildTransportOptions(),
      ).resolves.toEqual({
        connectorType: 'AWS_SES',
        region: 'eu-west-1',
        endpoint: undefined,
        credentials: {
          accessKeyId: 'AKIA123',
          secretAccessKey: 'secret-123',
          sessionToken: 'session-123',
        },
        from: 'ses@example.com',
      });
    });

    it('exposes environment SMTP settings when no injected settings service exists', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.E2E;
      process.env.MAIL_HOST = 'smtp.env.example.com';
      process.env.MAIL_PORT = '2525';
      process.env.MAIL_USER = 'env-user';
      process.env.MAIL_PASS = 'env-pass';
      process.env.MAIL_FROM = 'env@example.com';

      const envService = new EmailService();

      await expect((envService as any).getRuntimeSettings()).resolves.toEqual({
        connectorType: 'SMTP',
        host: 'smtp.env.example.com',
        port: 2525,
        user: 'env-user',
        pass: 'env-pass',
        from: 'env@example.com',
        source: 'environment',
      });
    });

    it('exposes default SMTP settings when no mail environment exists', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.E2E;
      delete process.env.MAIL_HOST;
      delete process.env.MAIL_PORT;
      delete process.env.MAIL_USER;
      delete process.env.MAIL_PASS;
      delete process.env.MAIL_FROM;

      const defaultService = new EmailService();

      await expect(
        (defaultService as any).getRuntimeSettings(),
      ).resolves.toEqual({
        connectorType: 'SMTP',
        host: 'mailpit',
        port: 1025,
        user: null,
        pass: null,
        from: '"Mecerka" <no-reply@mecerka.local>',
        source: 'default',
      });
    });

    it('masks valid email addresses and detects real non-test mode', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.E2E;

      const nonTestService = new EmailService();

      expect((nonTestService as any).maskEmail('user@example.com')).toBe(
        'u****@example.com',
      );
      expect((nonTestService as any).isTestTransport()).toBe(false);
    });
  });
});
