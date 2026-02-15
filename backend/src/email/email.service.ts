import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST || 'mailpit',
      port: Number(process.env.MAIL_PORT) || 1025,
      secure: false,
    });
  }

  async sendEmail(to: string, subject: string, html: string) {
    // Send asynchronously without blocking the main flow
    return this.sendMailAsync(to, subject, html);
  }

  private async sendMailAsync(to: string, subject: string, html: string) {
    const from =
      process.env.EMAIL_FROM || '"Mecerka" <no-reply@mecerka.local>';
    const maskedTo = this.maskEmail(to);

    try {
      const info = (await this.transporter.sendMail({
        from,
        to,
        subject,
        html,
      })) as { messageId: string };
      console.log(`[EmailService] Email sent: ${info.messageId} to ${maskedTo}`);
      return info;
    } catch (error) {
      console.error(
        `[EmailService] Failed to send email to ${maskedTo}:`,
        error,
      );
      throw error;
    }
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
