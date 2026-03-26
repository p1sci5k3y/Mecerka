import {
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MfaCompleteGuard } from '../auth/guards/mfa-complete.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { RequestWithUser } from '../auth/interfaces/auth.interfaces';
import { DemoService } from './demo.service';

@Controller('demo')
@UseGuards(JwtAuthGuard, MfaCompleteGuard, RolesGuard)
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  @Post('seed')
  @Roles(Role.ADMIN)
  seed(@Request() req: RequestWithUser) {
    return this.demoService.seed(req.user.userId);
  }

  @Post('reset')
  @Roles(Role.ADMIN)
  reset(@Request() req: RequestWithUser) {
    return this.demoService.reset(req.user.userId);
  }

  @Post('payments/provider-order/:providerOrderId/confirm')
  @Roles(Role.CLIENT, Role.ADMIN)
  confirmProviderOrderPayment(
    @Param('providerOrderId', ParseUUIDPipe) providerOrderId: string,
    @Request() req: RequestWithUser,
  ) {
    return this.demoService.confirmDemoProviderOrderPayment(
      providerOrderId,
      req.user.userId,
      req.user.roles,
    );
  }

  @Post('payments/delivery-order/:deliveryOrderId/confirm')
  @Roles(Role.CLIENT, Role.ADMIN)
  confirmRunnerPayment(
    @Param('deliveryOrderId', ParseUUIDPipe) deliveryOrderId: string,
    @Request() req: RequestWithUser,
  ) {
    return this.demoService.confirmDemoRunnerPayment(
      deliveryOrderId,
      req.user.userId,
      req.user.roles,
    );
  }
}
