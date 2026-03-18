import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AppService } from './app.service';
import { Roles } from './auth/decorators/roles.decorator';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { MfaCompleteGuard } from './auth/guards/mfa-complete.guard';
import { RolesGuard } from './auth/guards/roles.guard';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }

  @Get('metrics')
  @UseGuards(JwtAuthGuard, MfaCompleteGuard, RolesGuard)
  @Roles(Role.ADMIN)
  getMetrics() {
    return this.appService.getMetrics();
  }
}
