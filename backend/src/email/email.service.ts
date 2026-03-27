import { Injectable, Logger, Optional } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { EmailSettingsService } from './email-settings.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    @Optional()
    private readonly emailSettingsService?: EmailSettingsService,
  ) {}

  async sendEmail(to: string, subject: string, html: string) {
    // Send asynchronously without blocking the main flow
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
    const transportOptions = await this.buildTransportOptions();
    const transporter = nodemailer.createTransport(
      transportOptions as nodemailer.TransportOptions,
    );
    const from =
      'jsonTransport' in transportOptions
        ? process.env.MAIL_FROM || '"Mecerka" <no-reply@mecerka.local>'
        : transportOptions.from;
    const maskedTo = this.maskEmail(to);
    this.logger.debug(`Sending email to ${maskedTo}`);

    const info = (await transporter.sendMail({
      from,
      to,
      subject,
      html,
    })) as { messageId: string };
    this.logger.log(
      JSON.stringify({
        event: 'email.sent',
        message: 'Email sent successfully',
      }),
    );
    return info;
  }

  private maskEmail(email: string): string {
    const lastAtIndex = email.lastIndexOf('@');
    if (lastAtIndex <= 0) return '***'; // Invalid or missing local part

    const local = email.slice(0, lastAtIndex);
    const domain = email.slice(lastAtIndex + 1);

    if (!local || !domain) return '***';

    return `${local[0]}****@${domain}`;
  }

  private isTestTransport() {
    return process.env.NODE_ENV === 'test' || process.env.E2E === 'true';
  }

  private async buildTransportOptions(): Promise<
    Record<string, unknown> & { from?: string }
  > {
    if (this.isTestTransport()) {
      this.logger.log(
        JSON.stringify({
          event: 'email.transport.configured',
          message: 'Email transport configured',
          mode: 'json-test',
        }),
      );
      return {
        jsonTransport: true,
      };
    }

    const settings = this.emailSettingsService
      ? await this.emailSettingsService.getRuntimeSettings()
      : {
          host: process.env.MAIL_HOST || 'mailpit',
          port: Number(process.env.MAIL_PORT) || 1025,
          user: process.env.MAIL_USER?.trim() || null,
          pass: process.env.MAIL_PASS?.trim() || null,
          from:
            process.env.MAIL_FROM?.trim() ||
            '"Mecerka" <no-reply@mecerka.local>',
          source: process.env.MAIL_HOST ? 'environment' : 'default',
        };

    this.logger.log(
      JSON.stringify({
        event: 'email.transport.configured',
        message: 'Email transport configured',
        source: settings.source,
      }),
    );

    return {
      host: settings.host,
      port: settings.port,
      secure: settings.port === 465,
      auth:
        settings.user && settings.pass
          ? { user: settings.user, pass: settings.pass }
          : undefined,
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production',
      },
      from: settings.from,
    };
  }
}
