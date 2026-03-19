import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MfaCompleteGuard } from '../auth/guards/mfa-complete.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ObservabilityService } from './observability.service';
import {
  DEFAULT_OBSERVABILITY_WINDOW,
  isObservabilityWindow,
  ObservabilityWindow,
} from './observability.types';

@Controller('observability')
@UseGuards(JwtAuthGuard, MfaCompleteGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ObservabilityController {
  constructor(private readonly observabilityService: ObservabilityService) { }

  private parseWindow(window?: string): ObservabilityWindow {
    if (!window) {
      return DEFAULT_OBSERVABILITY_WINDOW;
    }

    if (isObservabilityWindow(window)) {
      // False positive: window is constrained to '24h' | '7d' | '30d' by the
      // type guard above; arbitrary input never reaches the return statement.
      return window;
    }

    throw new BadRequestException(
      'Invalid window. Expected one of: 24h, 7d, 30d',
    );
  }

  @Get('metrics')
  getMetrics(@Query('window') window?: string) {
    return this.observabilityService.getMetrics(this.parseWindow(window));
  }

  @Get('sla')
  getSlaMetrics(@Query('window') window?: string) {
    return this.observabilityService.getSlaMetrics(this.parseWindow(window));
  }

  @Get('reconciliation')
  getReconciliation(@Query('window') window?: string) {
    return this.observabilityService.getReconciliation(
      this.parseWindow(window),
    );
  }
}
