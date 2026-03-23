import { Injectable, Logger } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';
import { EmailService } from '../email/email.service';

const totp = new TOTP({
  digits: 6,
  period: 30,
  crypto: new NobleCryptoPlugin(),
  base32: new ScureBase32Plugin(),
});

@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);
  private readonly userMfaStateSelect = {
    mfaSecret: true,
    mfaEnabled: true,
    mfaFailedAttempts: true,
    mfaLockUntil: true,
  } satisfies Prisma.UserSelect;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {
    // empty
  }

  async generateMfaSecret(userId: string, email: string) {
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

    const qrCode = await QRCode.toDataURL(otpauthUrl);

    // Send notification email without sensitive data
    await this.emailService
      .sendEmail(
        email,
        'MFA Setup Initiated',
        `<p>MFA setup has been initiated for your account. Please scan the QR code in the application to complete the process.</p>`,
      )
      .catch((err) =>
        this.logger.error(
          `Failed to send MFA email for user ${userId}`,
          err.stack,
        ),
      );

    return {
      secret,
      otpauthUrl,
      qrCode, // Sending Data URL instead of raw SVG for easier frontend handling
    };
  }

  async verifyMfaToken(userId: string, token: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: this.userMfaStateSelect,
    });
    if (!user?.mfaSecret) {
      return false;
    }

    // Check for lockout
    if (user.mfaLockUntil && user.mfaLockUntil > new Date()) {
      return false; // User is locked out
    }

    let isValid = false;
    try {
      const secret = user.mfaSecret;
      const currentStep = Math.floor(Date.now() / 1000 / 30);

      this.logger.debug(
        `Verifying MFA for user ${userId}. TimeStep: ${currentStep}. Secret length: ${secret?.length || 0}`,
      );

      // Refactored to use boolean return and window as periods.
      // We calculate seconds from periods for otplib v13 compatibility.
      const window = 2; // ± 2 periods (60s)
      isValid = (
        await totp.verify(token, {
          secret,
          epochTolerance: window * 30,
        })
      ).valid;

      this.logger.log(
        `MFA validation for ${userId}: ${isValid ? 'SUCCESS' : 'FAILED'}`,
      );
    } catch (e) {
      this.logger.error(`MFA Critical Error for user ${userId}:`, e);
      isValid = false;
    }

    if (isValid) {
      const enableMfaData: Prisma.UserUpdateInput = {
        mfaEnabled: true,
        mfaFailedAttempts: 0,
        mfaLockUntil: null,
      };

      await this.prisma.user.update({
        where: { id: userId },
        data: enableMfaData,
      });
      return true;
    } else {
      // Increment failed attempts and potentially lock

      const attempts = (user.mfaFailedAttempts || 0) + 1;

      let lockUntil = user.mfaLockUntil;

      if (attempts >= 5) {
        // Lock for 15 minutes
        lockUntil = new Date(Date.now() + 15 * 60 * 1000);
      }

      const failedAttemptData: Prisma.UserUpdateInput = {
        mfaFailedAttempts: attempts,
        mfaLockUntil: lockUntil,
      };

      await this.prisma.user.update({
        where: { id: userId },
        data: failedAttemptData,
      });

      return false;
    }
  }
}
