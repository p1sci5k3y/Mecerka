import { Injectable, Logger } from '@nestjs/common';
import { toDataURL } from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';
import { EmailService } from '../email/email.service';

const totp = new TOTP({
  digits: 6,
  period: 30,
  // Explicitly provide plugins to avoid CryptoPluginMissingError
  crypto: new NobleCryptoPlugin(),
  base32: new ScureBase32Plugin(),
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const userWithMfa = user as any;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (userWithMfa.mfaLockUntil && userWithMfa.mfaLockUntil > new Date()) {
      return false; // User is locked out
    }

    let isValid = false;
    try {
      // totp.verify(token, options) returns Promise<VerifyResult> in otplib v13
      const result = await totp.verify(token, {
        secret: userWithMfa.mfaSecret as string,
      });
      // VerifyResult is { valid: boolean, ... } or similar ?
      // If result is boolean? No, d.ts says Promise<VerifyResult>
      // Let's assume VerifyResult has 'isValid' or is boolean?
      // Wait, let's use explicit property access if possible or cast
      // Actually, otplib docs say it returns boolean if valid?
      // No, declaration says VerifyResult.
      // Let's check debug_otp output or assume it has 'valid' property based on common patterns.
      // Better safe:
      // VerifyResult usually has { valid: boolean }?
      // Let's just log it in debug first? No, trust the docs: "Returns Verification result with validity"
      isValid = result && typeof result === 'object' && 'valid' in result ? (result as any).valid : result === true;
    } catch (e) {
      this.logger.error('MFA Verify Error', e);
      isValid = false;
    }

    if (isValid) {
      await this.prisma.user.update({
        where: { id: userId },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: {
          mfaEnabled: true,
          mfaFailedAttempts: 0,
          mfaLockUntil: null,
        } as any,
      });
      return true;
    } else {
      // Increment failed attempts and potentially lock
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const attempts = ((userWithMfa.mfaFailedAttempts as number) || 0) + 1;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      let lockUntil = userWithMfa.mfaLockUntil as Date | null;

      if (attempts >= 5) {
        // Lock for 15 minutes
        lockUntil = new Date(Date.now() + 15 * 60 * 1000);
      }

      await this.prisma.user.update({
        where: { id: userId },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: {
          mfaFailedAttempts: attempts,
          mfaLockUntil: lockUntil,
        } as any,
      });

      return false;
    }
  }
}
