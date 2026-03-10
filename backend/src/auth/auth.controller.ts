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
import type { RequestWithUser } from './interfaces/auth.interfaces';
import { VerifyMfaDto } from './dto/verify-mfa.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly mfaService: MfaService,
  ) {}

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

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Request() req: RequestWithUser) {
    return this.authService.logout(req.user.userId);
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
  async getProfile(@Request() req: RequestWithUser) {
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

  @Post('mfa/generate-email-otp')
  @UseGuards(JwtAuthGuard)
  async generateMfaEmailOtp(@Request() req: RequestWithUser) {
    const user = await this.authService.findById(req.user.userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }
    await this.authService.generateMfaSetupOtp(user);
    return { success: true, message: 'OTP sent to email' };
  }

  @Post('mfa/setup')
  @UseGuards(JwtAuthGuard)
  async setupMfa(
    @Request() req: RequestWithUser,
    @Body('otpCode') otpCode: string,
  ) {
    const user = await this.authService.findById(req.user.userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (
      !otpCode ||
      user.mfaSetupToken !== otpCode ||
      !user.mfaSetupExpiresAt ||
      user.mfaSetupExpiresAt < new Date()
    ) {
      throw new BadRequestException('Invalid or expired OTP code.');
    }

    // Clear the OTP token now that it is consumed successfully
    await this.authService.clearMfaSetupOtp(user.id);

    return this.mfaService.generateMfaSecret(req.user.userId, user.email);
  }

  @Post('mfa/verify')
  @UseGuards(JwtAuthGuard)
  async verifyMfa(
    @Request() req: RequestWithUser,
    @Body() verifyMfaDto: VerifyMfaDto,
  ) {
    const isValid = await this.mfaService.verifyMfaToken(
      req.user.userId,
      verifyMfaDto.token,
    );
    if (!isValid) {
      throw new BadRequestException('MFA Code Invalid');
    }
    return this.authService.generateMfaCompleteToken(req.user.userId);
  }
}
