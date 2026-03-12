import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { EmailService } from '../email/email.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as argon2 from 'argon2';
import { Role, User } from '@prisma/client';
import * as crypto from 'node:crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {
    // empty
  }

  async register(dto: RegisterDto) {
    const { email, password, name, role } = dto;

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException('Un usuario con este correo ya existe');
    }

    const hashedPassword = await argon2.hash(password);
    const verificationToken = crypto.randomUUID();

    let createdUser;
    try {
      createdUser = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            password: hashedPassword,
            name: name || email.split('@')[0], // Default name
            roles: role ? [role] : [Role.CLIENT], // Default role array
            mfaEnabled: false, // User must set up MFA explicitly
            verificationToken,
            verificationTokenExpiresAt: new Date(
              Date.now() + 24 * 60 * 60 * 1000,
            ),
            emailVerified: false,
            lastEmailSentAt: new Date(),
          },
        });

        this.logger.log(`Created new user ${user.id} in transaction`);
        return user;
      });
    } catch (e) {
      const emailHash = crypto
        .createHash('sha256')
        .update(email)
        .digest('hex')
        .substring(0, 8);
      this.logger.error(
        `Failed to register user (db error) for ${emailHash}:`,
        e,
      );
      throw new BadRequestException(
        'No se pudo completar el registro. Por favor, intenta de nuevo más tarde.',
      );
    }

    try {
      await this.emailService.sendVerificationEmail(
        createdUser.email,
        verificationToken,
      );
    } catch (e) {
      this.logger.error(
        `Failed to send verification email to user ${createdUser.id}:`,
        e,
      );
      const emailHash = crypto
        .createHash('sha256')
        .update(createdUser.email)
        .digest('hex')
        .substring(0, 8);
      // Simulate creating a retry record or queuing a job via queueService (pending implementation).
      this.logger.warn(
        `Verification email for ${emailHash} failed. Logged for retry. User can use /auth/resend-verification endpoint.`,
      );
    }

    return {
      message:
        'Cuenta creada. Por favor, revisa tu correo para verificar tu cuenta.',
    };
  }

  async login(dto: LoginDto) {
    const { email, password } = dto;
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      const emailHash = crypto
        .createHash('sha256')
        .update(email)
        .digest('hex')
        .substring(0, 8);
      this.logger.warn(`Login failed: User not found for ${emailHash}`);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.emailVerified) {
      this.logger.warn(`Login failed: Email not verified for user ${user.id}`);
      throw new UnauthorizedException(
        'Por favor, verifica tu correo electrónico antes de iniciar sesión',
      );
    }

    const isPasswordValid = await argon2.verify(user.password, password);
    if (!isPasswordValid) {
      this.logger.warn(`Login failed: Invalid password for user ${user.id}`);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    this.logger.log(`User logged in: ${user.id}`);

    const sessionPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      mfaAuthenticated: !user.mfaEnabled,
      tokenVersion: user.tokenVersion,
    };
    const accessToken = this.jwtService.sign(sessionPayload);

    return {
      access_token: accessToken,
      mfaRequired: user.mfaEnabled,
      user: {
        id: user.id,
        email: user.email,
        roles: user.roles,
        mfaEnabled: user.mfaEnabled,
        hasPin: !!user.pin,
      },
    };
  }

  async generateMfaCompleteToken(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, roles: true, tokenVersion: true },
    });
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }
    const sessionPayload = {
      sub: userId,
      email: user.email,
      roles: user.roles,
      mfaAuthenticated: true,
      tokenVersion: user.tokenVersion,
    };
    return {
      success: true,
      access_token: this.jwtService.sign(sessionPayload),
      mfaAuthenticated: true,
    };
  }

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

  async findById(id: string) {
    this.logger.log(`Finding user by ID: ${id}`);
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) this.logger.warn(`User ${id} not found`);
    return user;
  }

  async generateMfaSetupOtp(user: User): Promise<void> {
    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await this.checkEmailRateLimit(user.id);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        mfaSetupToken: otpCode,
        mfaSetupExpiresAt: expiresAt,
        lastEmailSentAt: new Date(),
      },
    });

    try {
      await this.emailService.sendMfaSetupEmail(user.email, otpCode);
    } catch (error) {
      this.logger.error(
        `Failed to send MFA email to ${user.email}`,
        error instanceof Error ? error.stack : error,
      );
      await this.clearMfaSetupOtp(user.id);
      throw new BadRequestException(
        'Error sending email OTP. Please try again.',
      );
    }
  }

  async clearMfaSetupOtp(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaSetupToken: null,
        mfaSetupExpiresAt: null,
      },
    });
  }

  async resendVerificationEmail(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Prevent enumeration
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

    // 0. Check Rate Limit
    await this.checkEmailRateLimit(user.id);

    // 1. Save token to DB FIRST — so any subsequent email link is always valid
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
    } catch (e) {
      const emailHash = crypto
        .createHash('sha256')
        .update(email)
        .digest('hex')
        .substring(0, 8);
      this.logger.error(
        `Failed to save verification token to DB for ${emailHash}:`,
        e,
      );
      throw new BadRequestException(
        'No se pudo procesar la solicitud. Por favor, inténtalo de nuevo.',
      );
    }

    // 2. Send email AFTER the token is safely persisted
    try {
      await this.emailService.sendVerificationEmail(
        user.email,
        verificationToken,
      );
    } catch (e) {
      const emailHash = crypto
        .createHash('sha256')
        .update(email)
        .digest('hex')
        .substring(0, 8);
      this.logger.error(
        `Failed to resend verification email for ${emailHash}:`,
        e,
      );
      // Token is already saved — user can retry the resend action from the UI
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
      // Prevent email enumeration
      return {
        message:
          'Si el correo existe, recibirás un enlace para restablecer tu contraseña.',
      };
    }

    const resetToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    try {
      await this.emailService.sendPasswordResetEmail(user.email, resetToken);
    } catch (e) {
      // Create a deterministic hash of the email to avoid PII leak in logs
      const emailHash = crypto
        .createHash('sha256')
        .update(user.email)
        .digest('hex')
        .substring(0, 16);
      this.logger.error(
        `Failed to send password reset email to user [${emailHash}]:`,
        e,
      );
      throw new BadRequestException(
        'No se pudo enviar el correo de recuperación. Inténtalo de nuevo.',
      );
    }

    // 0. Check Rate Limit
    await this.checkEmailRateLimit(user.id);

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

    return {
      message:
        'Si el correo existe, recibirás un enlace para restablecer tu contraseña.',
    };
  }

  async logout(userId: string) {
    const res = await this.prisma.user.updateMany({
      where: { id: userId },
      data: {
        tokenVersion: { increment: 1 },
      },
    });
    if (res.count === 0) {
      return { success: false, message: 'Usuario no encontrado' };
    }
    return { success: true, message: 'Logged out successfully' };
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
    } else {
      throw new BadRequestException(
        'El token de restablecimiento es inválido.',
      );
    }
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

  private async checkEmailRateLimit(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { lastEmailSentAt: true },
    });

    if (user?.lastEmailSentAt) {
      const now = new Date();
      const diffSeconds = (now.getTime() - user.lastEmailSentAt.getTime()) / 1000;
      if (diffSeconds < 90) {
        const remaining = Math.ceil(90 - diffSeconds);
        throw new BadRequestException(
          `Por seguridad, solo puedes solicitar un correo cada 90 segundos. Por favor, espera ${remaining} segundos más.`,
        );
      }
    }
  }
}
