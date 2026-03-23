import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';

@Injectable()
export class AuthEmailWorkflowService {
  private readonly logger = new Logger(AuthEmailWorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findUnique({
      where: { verificationToken: token },
    });
    if (
      !user?.verificationTokenExpiresAt ||
      user.verificationTokenExpiresAt < new Date()
    ) {
      throw new BadRequestException(
        'Token de verificación inválido o expirado.',
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verificationToken: null },
    });

    return { message: 'Cuenta verificada con éxito.' };
  }

  async resendVerificationEmail(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return {
        message:
          'Si el correo existe y no ha sido verificado, se ha enviado un nuevo enlace.',
      };
    }
    if (user.emailVerified) {
      const emailHash = crypto
        .createHash('sha256')
        .update(email)
        .digest('hex')
        .substring(0, 8);
      this.logger.warn(
        `Resend verification requested for already verified account: ${emailHash}`,
      );
      return {
        message:
          'Si el correo existe y no ha sido verificado, se ha enviado un nuevo enlace.',
      };
    }

    const verificationToken = crypto.randomUUID();

    await this.assertEmailRateLimit(user.id);

    try {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          verificationToken,
          verificationTokenExpiresAt: new Date(
            Date.now() + 24 * 60 * 60 * 1000,
          ),
          lastEmailSentAt: new Date(),
        },
      });
    } catch (error) {
      const emailHash = crypto
        .createHash('sha256')
        .update(email)
        .digest('hex')
        .substring(0, 8);
      this.logger.error(
        `Failed to save verification token to DB for ${emailHash}:`,
        error,
      );
      throw new BadRequestException(
        'No se pudo procesar la solicitud. Por favor, inténtalo de nuevo.',
      );
    }

    try {
      await this.emailService.sendVerificationEmail(
        user.email,
        verificationToken,
      );
    } catch (error) {
      const emailHash = crypto
        .createHash('sha256')
        .update(email)
        .digest('hex')
        .substring(0, 8);
      this.logger.error(
        `Failed to resend verification email for ${emailHash}:`,
        error,
      );
      this.logger.warn(
        `Verification email resend failed for ${emailHash}. Token is saved; user can retry.`,
      );
      throw new BadRequestException(
        'No se pudo enviar el correo de verificación. Por favor, inténtalo de nuevo.',
      );
    }

    return {
      message:
        'Si el correo existe y no ha sido verificado, se ha enviado un nuevo enlace.',
    };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return {
        message:
          'Si el correo existe, recibirás un enlace para restablecer tu contraseña.',
      };
    }

    await this.assertEmailRateLimit(user.id);

    const resetToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const hashedToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordTokenHash: hashedToken,
        resetPasswordExpiresAt: expiresAt,
        lastEmailSentAt: new Date(),
      },
    });

    try {
      await this.emailService.sendPasswordResetEmail(user.email, resetToken);
    } catch (error) {
      const emailHash = crypto
        .createHash('sha256')
        .update(user.email)
        .digest('hex')
        .substring(0, 16);
      this.logger.error(
        `Failed to send password reset email to user [${emailHash}]:`,
        error,
      );
      throw new BadRequestException(
        'No se pudo enviar el correo de recuperación. Inténtalo de nuevo.',
      );
    }

    return {
      message:
        'Si el correo existe, recibirás un enlace para restablecer tu contraseña.',
    };
  }

  async verifyResetToken(token: string) {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await this.prisma.user.findUnique({
      where: { resetPasswordTokenHash: hashedToken },
    });

    if (user?.resetPasswordExpiresAt) {
      const expiresAt = user.resetPasswordExpiresAt;
      if (expiresAt < new Date()) {
        throw new BadRequestException(
          'El token de restablecimiento ha expirado.',
        );
      }
      return user;
    }

    throw new BadRequestException('El token de restablecimiento es inválido.');
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.verifyResetToken(token);
    const hashedPassword = await argon2.hash(newPassword);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordTokenHash: null,
        resetPasswordExpiresAt: null,
        passwordChangedAt: new Date(),
      },
    });

    return { message: 'Tu contraseña ha sido restablecida con éxito.' };
  }

  async assertEmailRateLimit(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { lastEmailSentAt: true },
    });

    if (user?.lastEmailSentAt) {
      const now = new Date();
      const diffSeconds =
        (now.getTime() - user.lastEmailSentAt.getTime()) / 1000;
      if (diffSeconds < 90) {
        const remaining = Math.ceil(90 - diffSeconds);
        throw new BadRequestException(
          `Por seguridad, solo puedes solicitar un correo cada 90 segundos. Por favor, espera ${remaining} segundos más.`,
        );
      }
    }
  }
}
