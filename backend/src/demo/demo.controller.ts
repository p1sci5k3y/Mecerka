import { Controller, Post, Request, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MfaCompleteGuard } from '../auth/guards/mfa-complete.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { RequestWithUser } from '../auth/interfaces/auth.interfaces';
import { DemoService } from './demo.service';

@Controller('demo')
@UseGuards(JwtAuthGuard, MfaCompleteGuard, RolesGuard)
@Roles(Role.ADMIN)
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  @Post('seed')
  seed(@Request() req: RequestWithUser) {
    return this.demoService.seed(req.user.userId);
  }

  @Post('reset')
  reset(@Request() req: RequestWithUser) {
    return this.demoService.reset(req.user.userId);
  }
}
