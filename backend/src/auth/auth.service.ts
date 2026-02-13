import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { EmailService } from '../email/email.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as argon2 from 'argon2';
import { Role, User } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private emailService: EmailService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, password, name, role } = registerDto;

    const userExists = await this.prisma.user.findUnique({
      where: { email },
    });

    if (userExists) {
      throw new ConflictException('Email already in use');
    }

    const hashedPassword = await argon2.hash(password);
    const userRole = role || Role.CLIENT;

    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: name || '',
        role: userRole,
      },
    });

    await this.emailService.sendEmail(
      email,
      'Welcome to Mecerka',
      `<h1>Welcome ${name || 'User'}!</h1><p>Thanks for registering.</p>`,
    );

    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }

  async validateUser(
    email: string,
    pass: string,
  ): Promise<Omit<User, 'password'> | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && (await argon2.verify(user.password, pass))) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // user is typed now
    const payload = { sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  async findById(id: number) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async resetPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (user) {
      await this.emailService.sendEmail(
        email,
        'Password Reset Request',
        '<p>This is a mock password reset email.</p>',
      );
    }

    // Always return success to prevent enumeration
    return {
      message:
        'If an account with that email exists, a reset email has been sent',
    };
  }
}
