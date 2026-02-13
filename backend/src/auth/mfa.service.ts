import { Injectable } from '@nestjs/common';
import { toDataURL } from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { authenticator } from '@otplib/preset-default';
import { EmailService } from '../email/email.service';

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async generateMfaSecret(userId: number, email: string) {
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(email, 'Mecerka (Startup)', secret);

    // Save secret to user but keep MFA disabled until verified
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: secret, mfaEnabled: false },
    });

    const qrCode = await toDataURL(otpauthUrl);

    this.emailService.sendEmail(
      email,
      'MFA Activation Code',
      `<p>Your MFA setup secret is: <b>${secret}</b></p>`,
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

    const isValid = authenticator.verify({
      token,
      secret: user.mfaSecret,
    });

    if (isValid) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { mfaEnabled: true },
      });
    }

    return isValid;
  }
}
