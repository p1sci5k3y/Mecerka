import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ConfirmResetPasswordDto } from './dto/confirm-reset-password.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { MfaService } from './mfa.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UserFromJwt } from './interfaces/auth.interfaces';
import { VerifyMfaDto } from './dto/verify-mfa.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly mfaService: MfaService,
  ) { }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Get('verify')
  async verifyEmail(@Query('token') token: string) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    return this.authService.verifyEmail(token);
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('resend-verification')
  async resendVerificationEmail(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerificationEmail(dto.email);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Get('verify-reset-token')
  async verifyResetTokenEndpoint(@Query('token') token: string) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    await this.authService.verifyResetToken(token);
    // Explicitly hide the user object returned by verifyResetToken internally
    return { valid: true };
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('reset-password')
  async resetPassword(@Body() dto: ConfirmResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req: { user: UserFromJwt }) {
    const user = await this.authService.findById(req.user.userId);
    if (!user) throw new BadRequestException('User not found');
    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles,
      mfaEnabled: user.mfaEnabled,
    };
  }

  @Post('mfa/setup')
  @UseGuards(JwtAuthGuard)
  async setupMfa(@Request() req: { user: UserFromJwt }) {
    // We need email, but UserFromJwt only has userId and role.
    // We should fetch user email or update JWT strategy/interface.
    // For now, let's fetch user from service or Prisma.
    // Check if authService has a method to get user by ID.
    // Or just let mfaService fetch it.
    // Wait, MfaService.generateMfaSecret takes (userId, email).
    // Let's modify MfaService to look up email if only userId is passed?
    // Or just fetch it here.
    const user = await this.authService.findById(req.user.userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }
    return this.mfaService.generateMfaSecret(req.user.userId, user.email);
  }

  @Post('mfa/verify')
  @UseGuards(JwtAuthGuard)
  async verifyMfa(
    @Request() req: { user: UserFromJwt },
    @Body() verifyMfaDto: VerifyMfaDto,
  ) {
    const isValid = await this.mfaService.verifyMfaToken(
      req.user.userId,
      verifyMfaDto.token,
    );
    if (!isValid) {
      throw new BadRequestException('MFA Code Invalid');
    }
    return { success: true };
  }
}
