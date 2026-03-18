import { Controller, Post, UseGuards, Request, Body } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestWithUser } from '../auth/interfaces/auth.interfaces';
import { SetPinDto } from './dto/set-pin.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MfaCompleteGuard } from '../auth/guards/mfa-complete.guard';
import { RequestRoleDto } from './dto/request-role.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, MfaCompleteGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('pin')
  async setTransactionPin(
    @Request() req: RequestWithUser,
    @Body() dto: SetPinDto,
  ) {
    return this.usersService.setTransactionPin(req.user.userId, dto.pin);
  }

  @Post('request-role')
  async requestRole(
    @Request() req: RequestWithUser,
    @Body() dto: RequestRoleDto,
  ) {
    return this.usersService.requestRole(req.user.userId, dto);
  }
}
