import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MfaCompleteGuard } from '../auth/guards/mfa-complete.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ObservabilityService } from './observability.service';
import { DEFAULT_OBSERVABILITY_WINDOW } from './observability.types';
import { ObservabilityWindowQueryDto } from './dto/observability-window-query.dto';

@Controller('observability')
@UseGuards(JwtAuthGuard, MfaCompleteGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ObservabilityController {
  constructor(private readonly observabilityService: ObservabilityService) {}

  @Get('metrics')
  getMetrics(@Query() query: ObservabilityWindowQueryDto = {}) {
    return this.observabilityService.getMetrics(
      query.window ?? DEFAULT_OBSERVABILITY_WINDOW,
    );
  }

  @Get('sla')
  getSlaMetrics(@Query() query: ObservabilityWindowQueryDto = {}) {
    return this.observabilityService.getSlaMetrics(
      query.window ?? DEFAULT_OBSERVABILITY_WINDOW,
    );
  }

  @Get('reconciliation')
  getReconciliation(@Query() query: ObservabilityWindowQueryDto = {}) {
    return this.observabilityService.getReconciliation(
      query.window ?? DEFAULT_OBSERVABILITY_WINDOW,
    );
  }
}
