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
import { DISPOSABLE_DOMAINS } from '../common/utils/disposable-domains';
import * as crypto from 'crypto';

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

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException('Un usuario con este correo ya existe');
    }

    const hashedPassword = await argon2.hash(password);
    const verificationToken = crypto.randomUUID();

    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: name || email.split('@')[0], // Default name
        roles: role ? [role] : [Role.CLIENT], // Default role array
        mfaEnabled: true, // User must set up MFA explicitly
        verificationToken,
        emailVerified: false,
      },
    });

    this.logger.log(`Created new user ${user.id} (${user.email}) with verification token`);

    await this.emailService.sendVerificationEmail(user.email, verificationToken);

    return {
      message: 'Cuenta creada. Por favor, revisa tu correo para verificar tu cuenta.',
    };
  }

  async login(dto: LoginDto) {
    const { email, password } = dto;
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      this.logger.warn(`Login failed: User not found for ${email}`);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.emailVerified) {
      this.logger.warn(`Login failed: Email not verified for ${email}`);
      throw new UnauthorizedException('Debes validar tu correo antes de iniciar sesión.');
    }

    const isPasswordValid = await argon2.verify(user.password, password);
    if (!isPasswordValid) {
      this.logger.warn(`Login failed: Invalid password for ${email}`);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    this.logger.log(`User logged in: ${user.id} (${user.email})`);

    const sessionPayload = { sub: user.id, email: user.email, roles: user.roles };
    const accessToken = this.jwtService.sign(sessionPayload);

    return {
      access_token: accessToken,
      user: {
        id: user.id,
        email: user.email,
        roles: user.roles,
        mfaEnabled: user.mfaEnabled,
        hasPin: !!user.pin
      }
    };
  }

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findUnique({ where: { verificationToken: token } });
    if (!user) {
      throw new BadRequestException('Token de verificación inválido o expirado.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verificationToken: null },
    });

    return { message: 'Cuenta verificada con éxito.' };
  }

  async findById(id: number) {
    this.logger.log(`Finding user by ID: ${id}`);
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) this.logger.warn(`User ${id} not found`);
    return user;
  }
}
