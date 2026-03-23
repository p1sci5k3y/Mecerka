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
import { AuthEmailWorkflowService } from './auth-email-workflow.service';

type AuthProfileRecord = {
  id: string;
  email: string;
  name: string;
  roles: Role[];
  mfaEnabled: boolean;
  pin: string | null;
  stripeAccountId: string | null;
  mfaSetupToken: string | null;
  mfaSetupExpiresAt: Date | null;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly authEmailWorkflowService: AuthEmailWorkflowService,
  ) {
    // empty
  }

  async register(dto: RegisterDto) {
    const { email, password, name } = dto;

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
            roles: [Role.CLIENT],
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
    return this.authEmailWorkflowService.verifyEmail(token);
  }

  async findById(id: string): Promise<AuthProfileRecord | null> {
    this.logger.log(`Finding user by ID: ${id}`);
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        roles: true,
        mfaEnabled: true,
        pin: true,
        stripeAccountId: true,
        mfaSetupToken: true,
        mfaSetupExpiresAt: true,
      },
    });
    if (!user) this.logger.warn(`User ${id} not found`);
    return user;
  }

  async generateMfaSetupOtp(user: Pick<User, 'id' | 'email'>): Promise<void> {
    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await this.authEmailWorkflowService.assertEmailRateLimit(user.id);
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
    return this.authEmailWorkflowService.resendVerificationEmail(email);
  }
  async forgotPassword(email: string) {
    return this.authEmailWorkflowService.forgotPassword(email);
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
    return this.authEmailWorkflowService.verifyResetToken(token);
  }

  async resetPassword(token: string, newPassword: string) {
    return this.authEmailWorkflowService.resetPassword(token, newPassword);
  }
}
