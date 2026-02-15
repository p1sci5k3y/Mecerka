import { Injectable } from '@nestjs/common';
import { toDataURL } from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { generateSecret, generateURI, verifySync } from 'otplib';
import { EmailService } from '../email/email.service';

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) { }

  async generateMfaSecret(userId: number, email: string) {
    const secret = generateSecret();
    const otpauthUrl = generateURI({
      label: email,
      issuer: 'Mecerka (Startup)',
      secret,
    });

    // Save secret to user but keep MFA disabled until verified
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: secret, mfaEnabled: false },
    });

    const qrCode = await toDataURL(otpauthUrl);

    // Send notification email without sensitive data
    await this.emailService.sendEmail(
      email,
      'MFA Setup Initiated',
      `<p>MFA setup has been initiated for your account. Please scan the QR code in the application to complete the process.</p>`,
    );

    return {
      secret,
      otpauthUrl,
      qrCode, // Sending Data URL instead of raw SVG for easier frontend handling
    };
  }

  async verifyMfaToken(userId: number, token: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.mfaSecret) {
      return false;
    }

    const result = verifySync({
      token,
      secret: user.mfaSecret,
    });

    if (result.valid) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { mfaEnabled: true },
      });
    }

    return result.valid;
  }
}
