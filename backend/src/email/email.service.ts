import { Injectable, Logger, Optional } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import {
  SESv2Client,
  SendEmailCommand,
  SendEmailCommandOutput,
} from '@aws-sdk/client-sesv2';
import {
  AwsSesRuntimeSettings,
  EmailSettingsService,
  RuntimeEmailSettings,
  SmtpRuntimeSettings,
} from './email-settings.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    @Optional()
    private readonly emailSettingsService?: EmailSettingsService,
  ) {}

  async sendEmail(to: string, subject: string, html: string) {
    return this.sendMailAsync(to, subject, html);
  }

  async sendVerificationEmail(to: string, token: string) {
    const defaultUrl = 'http://localhost:3000';
    const frontendUrl = process.env.FRONTEND_URL || defaultUrl;
    const verificationLink = `${frontendUrl}/es/verify?token=${encodeURIComponent(token)}`;

    const subject = 'Verifica tu cuenta en Mecerka';
    const html = `
      <h1>Bienvenido a Mecerka</h1>
      <p>Gracias por registrarte. Para activar tu cuenta, por favor haz clic en el siguiente enlace:</p>
      <a href="${verificationLink}">Verificar Cuenta</a>
      <p>Si el enlace no funciona, copia y pega esta URL en tu navegador: ${verificationLink}</p>
    `;
    return this.sendMailAsync(to, subject, html);
  }

  async sendPasswordResetEmail(to: string, token: string) {
    const defaultUrl = 'http://localhost:3000';
    const frontendUrl = process.env.FRONTEND_URL || defaultUrl;
    const resetLink = `${frontendUrl}/es/reset-password?token=${encodeURIComponent(token)}`;

    const subject = 'Restablecimiento de contraseña - Mecerka';
    const html = `
      <h1>Restablecer Contraseña</h1>
      <p>Has solicitado restablecer tu contraseña. Haz clic en el siguiente enlace para crear una nueva:</p>
      <a href="${resetLink}">Restablecer Contraseña</a>
      <p>Si no solicitaste esto, puedes ignorar este correo.</p>
      <p>Si el enlace no funciona, copia y pega esta URL en tu navegador: ${resetLink}</p>
    `;
    return this.sendMailAsync(to, subject, html);
  }

  async sendMfaSetupEmail(to: string, code: string) {
    if (!/^\d{6}$/.test(code)) {
      throw new Error('Invalid MFA code format');
    }
    const subject = 'Código de Configuración de MFA';
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #4A90E2;">Configuración de Seguridad en Mecerka</h2>
        <p>Has solicitado vincular tu cuenta con una aplicación Authenticator (2FA).</p>
        <p>Usa este código de verificación temporal de 6 dígitos para desbloquear tu Código QR:</p>
        <h1 style="letter-spacing: 0.2em; text-align: center; border: 2px dashed #ececec; padding: 15px; border-radius: 8px;">${code}</h1>
        <p><em>Este código expirará en 10 minutos. Si no has solicitado esto, puedes ignorar este correo.</em></p>
      </div>
    `;
    return this.sendMailAsync(to, subject, html);
  }

  private async sendMailAsync(to: string, subject: string, html: string) {
    if (this.isTestTransport()) {
      const transporter = nodemailer.createTransport({
        jsonTransport: true,
      } as nodemailer.TransportOptions);
      return transporter.sendMail({
        from: process.env.MAIL_FROM || '"Mecerka" <no-reply@mecerka.local>',
        to,
        subject,
        html,
      }) as Promise<{ messageId: string }>;
    }

    const settings = await this.getRuntimeSettings();
    const maskedTo = this.maskEmail(to);
    this.logger.debug(`Sending email to ${maskedTo}`);
    this.logger.log(
      JSON.stringify({
        event: 'email.transport.configured',
        message: 'Email transport configured',
        source: settings.source,
        connectorType: settings.connectorType,
      }),
    );

    if (settings.connectorType === 'AWS_SES') {
      return this.sendWithAwsSes(settings, to, subject, html);
    }

    return this.sendWithSmtp(settings, to, subject, html);
  }

  private async sendWithSmtp(
    settings: SmtpRuntimeSettings,
    to: string,
    subject: string,
    html: string,
  ) {
    const transporter = nodemailer.createTransport(
      this.buildSmtpTransportOptions(settings) as nodemailer.TransportOptions,
    );
    const info = (await transporter.sendMail({
      from: settings.from,
      to,
      subject,
      html,
    })) as { messageId: string };

    this.logger.log(
      JSON.stringify({
        event: 'email.sent',
        message: 'Email sent successfully',
        connectorType: settings.connectorType,
      }),
    );

    return info;
  }

  private async sendWithAwsSes(
    settings: AwsSesRuntimeSettings,
    to: string,
    subject: string,
    html: string,
  ) {
    const client = this.createAwsSesClient(settings);
    const result: SendEmailCommandOutput = await client.send(
      new SendEmailCommand({
        FromEmailAddress: settings.from,
        Destination: {
          ToAddresses: [to],
        },
        Content: {
          Simple: {
            Subject: {
              Data: subject,
              Charset: 'UTF-8',
            },
            Body: {
              Html: {
                Data: html,
                Charset: 'UTF-8',
              },
            },
          },
        },
      }),
    );

    this.logger.log(
      JSON.stringify({
        event: 'email.sent',
        message: 'Email sent successfully',
        connectorType: settings.connectorType,
      }),
    );

    return { messageId: result.MessageId || 'aws-ses' };
  }

  private createAwsSesClient(settings: AwsSesRuntimeSettings) {
    return new SESv2Client({
      region: settings.region,
      endpoint: settings.endpoint || undefined,
      credentials: {
        accessKeyId: settings.accessKeyId,
        secretAccessKey: settings.secretAccessKey,
        sessionToken: settings.sessionToken || undefined,
      },
    });
  }

  private buildSmtpTransportOptions(settings: SmtpRuntimeSettings) {
    const localDefault =
      settings.source === 'default' && settings.host === 'mailpit';

    return {
      host: settings.host,
      port: settings.port,
      secure: settings.port === 465,
      requireTLS: !localDefault,
      auth:
        settings.user && settings.pass
          ? { user: settings.user, pass: settings.pass }
          : undefined,
      tls: localDefault
        ? { rejectUnauthorized: false }
        : {
            rejectUnauthorized: true,
            minVersion: 'TLSv1.2',
            servername: settings.host,
          },
      from: settings.from,
    };
  }

  private async getRuntimeSettings(): Promise<RuntimeEmailSettings> {
    if (this.emailSettingsService) {
      return this.emailSettingsService.getRuntimeSettings();
    }

    const host = process.env.MAIL_HOST || 'mailpit';
    return {
      connectorType: 'SMTP',
      host,
      port: Number(process.env.MAIL_PORT) || 1025,
      user: process.env.MAIL_USER?.trim() || null,
      pass: process.env.MAIL_PASS?.trim() || null,
      from:
        process.env.MAIL_FROM?.trim() || '"Mecerka" <no-reply@mecerka.local>',
      source: process.env.MAIL_HOST ? 'environment' : 'default',
    };
  }

  private async buildTransportOptions() {
    if (this.isTestTransport()) {
      return { jsonTransport: true };
    }

    const settings = await this.getRuntimeSettings();
    if (settings.connectorType === 'AWS_SES') {
      return {
        connectorType: 'AWS_SES',
        region: settings.region,
        endpoint: settings.endpoint || undefined,
        credentials: {
          accessKeyId: settings.accessKeyId,
          secretAccessKey: settings.secretAccessKey,
          sessionToken: settings.sessionToken || undefined,
        },
        from: settings.from,
      };
    }

    return this.buildSmtpTransportOptions(settings);
  }

  private maskEmail(email: string): string {
    const lastAtIndex = email.lastIndexOf('@');
    if (lastAtIndex <= 0) return '***';

    const local = email.slice(0, lastAtIndex);
    const domain = email.slice(lastAtIndex + 1);

    if (!local || !domain) return '***';

    return `${local[0]}****@${domain}`;
  }

  private isTestTransport() {
    return process.env.NODE_ENV === 'test' || process.env.E2E === 'true';
  }
}
