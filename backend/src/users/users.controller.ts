import { Controller, Post, UseGuards, Request, Body } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtService } from '@nestjs/jwt';
import type { RequestWithUser } from '../auth/interfaces/auth.interfaces';
import { SetPinDto } from './dto/set-pin.dto';
import * as argon2 from 'argon2';

import { RolesGuard } from '../auth/guards/roles.guard';
import { MfaCompleteGuard } from '../auth/guards/mfa-complete.guard';

@Controller('users')
@UseGuards(JwtAuthGuard, MfaCompleteGuard, RolesGuard)
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('pin')
  async setTransactionPin(
    @Request() req: RequestWithUser,
    @Body() dto: SetPinDto,
  ) {
    const userId = req.user.userId;
    const hashedPin = await argon2.hash(dto.pin);

    await this.prisma.user.update({
      where: { id: userId },
      data: { pin: hashedPin },
    });

    return { message: 'PIN transaccional configurado correctamente' };
  }
}
