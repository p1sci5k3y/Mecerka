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
    try {
      await this.sendMailAsync(to, subject, html);
    } catch (error) {
      console.error(`[EmailService] Failed to send email to ${to}:`, error);
    }
  }

  private async sendMailAsync(to: string, subject: string, html: string) {
    const from = process.env.EMAIL_FROM || '"Mecerka" <no-reply@meceka.local>';
    const info = (await this.transporter.sendMail({
      from,
      to,
      subject,
      html,
    })) as { messageId: string };
    console.log(`[EmailService] Email sent: ${info.messageId} to ${to}`);
    return info;
  }
}
