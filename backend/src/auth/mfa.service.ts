import { Injectable, Logger } from '@nestjs/common';
import { toDataURL } from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { TOTP } from 'otplib';
import { EmailService } from '../email/email.service';

// authenticator in otplib v13+ is essentially a TOTP instance
const totp = new TOTP({
  digits: 6,
  period: 30,
});

@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {
    // empty
  }

  async generateMfaSecret(userId: number, email: string) {
    const secret = totp.generateSecret();
    const otpauthUrl = totp.toURI({
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
    await this.emailService
      .sendEmail(
        email,
        'MFA Setup Initiated',
        `<p>MFA setup has been initiated for your account. Please scan the QR code in the application to complete the process.</p>`,
      )
      .catch((err) =>
        this.logger.error(`Failed to send MFA email to ${email}`, err.stack),
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
    // Casting to any to avoid IDE persistent cache errors (fields exist in DB and build passes)
    const userWithMfa = user as any;
    if (userWithMfa.mfaLockUntil && userWithMfa.mfaLockUntil > new Date()) {
      return false; // User is locked out
    }

    let isValid = false;
    try {
      // Use class method signature: verify(token, options)
      // Note: TOTP verify returns Promise<VerifyResult>, not boolean directly.
      const { valid } = await totp.verify(token, {
        secret: userWithMfa.mfaSecret,
      });
      isValid = valid;
    } catch {
      // Handle potential errors from verify
      isValid = false;
    }

    if (isValid) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          mfaEnabled: true,
          mfaFailedAttempts: 0,
          mfaLockUntil: null,
        } as any,
      });
      return true;
    } else {
      // Increment failed attempts and potentially lock
      const attempts = (userWithMfa.mfaFailedAttempts || 0) + 1;
      let lockUntil = userWithMfa.mfaLockUntil;

      if (attempts >= 5) {
        // Lock for 15 minutes
        lockUntil = new Date(Date.now() + 15 * 60 * 1000);
      }

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          mfaFailedAttempts: attempts,
          mfaLockUntil: lockUntil,
        } as any,
      });

      return false;
    }
  }
}
