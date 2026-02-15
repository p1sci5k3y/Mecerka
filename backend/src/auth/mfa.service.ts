import { Injectable } from '@nestjs/common';
import { toDataURL } from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { TOTP } from 'otplib';
import { EmailService } from '../email/email.service';

// authenticator in otplib v13+ is essentially a TOTP instance
const authenticator = new TOTP({
  digits: 6,
  period: 30,
});

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {
    // empty
  }

  async generateMfaSecret(userId: number, email: string) {
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.toURI({
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
    this.emailService.sendEmail(
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

    // Check for lockout
    if (user.mfaLockUntil && user.mfaLockUntil > new Date()) {
      return false; // User is locked out
    }

    let isValid = false;
    try {
      const result = await authenticator.verify(
        token,
        { secret: user.mfaSecret }
      );
      isValid = result?.valid || false;
    } catch (e) {
      // Handle potential errors from verify
      // e.g. token format invalid
      isValid = false;
    }

    if (isValid) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          mfaEnabled: true,
          mfaFailedAttempts: 0,
          mfaLockUntil: null,
        },
      });
      return true;
    } else {
      // Increment failed attempts and potentially lock
      const attempts = user.mfaFailedAttempts + 1;
      let lockUntil = user.mfaLockUntil;

      if (attempts >= 5) {
        // Lock for 15 minutes
        lockUntil = new Date(Date.now() + 15 * 60 * 1000);
      }

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          mfaFailedAttempts: attempts,
          mfaLockUntil: lockUntil,
        },
      });

      return false;
    }
  }
}
