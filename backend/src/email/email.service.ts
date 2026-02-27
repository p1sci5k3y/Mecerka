import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly transporter: nodemailer.Transporter;

  constructor() {
    const host = process.env.MAIL_HOST || 'mailpit';
    const port = Number(process.env.MAIL_PORT) || 1025;
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: false,
    });
    console.log(`[EmailService] Configured with host: ${host}, port: ${port}`);
  }

  async sendEmail(to: string, subject: string, html: string) {
    // Send asynchronously without blocking the main flow
    return this.sendMailAsync(to, subject, html);
  }

  async sendVerificationEmail(to: string, token: string) {
    const defaultUrl = 'http://localhost:3000';
    const frontendUrl = process.env.FRONTEND_URL || defaultUrl;
    const verificationLink = `${frontendUrl}/es/verify?token=${token}`;

    const subject = 'Verifica tu cuenta en Mecerka';
    const html = `
      <h1>Bienvenido a Mecerka</h1>
      <p>Gracias por registrarte. Para activar tu cuenta, por favor haz clic en el siguiente enlace:</p>
      <a href="${verificationLink}">Verificar Cuenta</a>
      <p>Si el enlace no funciona, copia y pega esta URL en tu navegador: ${verificationLink}</p>
    `;
    return this.sendMailAsync(to, subject, html);
  }

  private async sendMailAsync(to: string, subject: string, html: string) {
    const from = process.env.EMAIL_FROM || '"Mecerka" <no-reply@mecerka.local>';
    const maskedTo = this.maskEmail(to);

    const info = (await this.transporter.sendMail({
      from,
      to,
      subject,
      html,
    })) as { messageId: string };
    console.log(`[EmailService] Email sent: ${info.messageId} to ${maskedTo}`);
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
}
