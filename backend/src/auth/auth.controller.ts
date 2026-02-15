import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UserFromJwt } from './interfaces/auth.interfaces';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyMfaDto } from './dto/verify-mfa.dto';

import { MfaService } from './mfa.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly mfaService: MfaService,
  ) { }

  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  // ...

  // ...

  @Post('reset-password')
  resetPassword(@Body() resetDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetDto.email);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getProfile(@Request() req: { user: UserFromJwt }) {
    return req.user;
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
