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

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

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
