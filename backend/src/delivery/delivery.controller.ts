import {
  Body,
  Controller,
  Get,
  Patch,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MfaCompleteGuard } from '../auth/guards/mfa-complete.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserFromJwt } from '../auth/interfaces/auth.interfaces';
import { AssignDeliveryRunnerDto } from './dto/assign-delivery-runner.dto';
import { ConfirmDeliveryDto } from './dto/confirm-delivery.dto';
import { CreateDeliveryIncidentDto } from './dto/create-delivery-incident.dto';
import { CreateDeliveryOrderDto } from './dto/create-delivery-order.dto';
import { UpdateDeliveryLocationDto } from './dto/update-delivery-location.dto';
import { DeliveryService } from './delivery.service';

@Controller('delivery')
@UseGuards(JwtAuthGuard, MfaCompleteGuard, RolesGuard)
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Post('orders')
  @Roles(Role.CLIENT, Role.ADMIN)
  createDeliveryOrder(
    @Body() dto: CreateDeliveryOrderDto,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.deliveryService.createDeliveryOrder(
      dto,
      req.user.userId,
      req.user.roles,
    );
  }

  @Post('orders/:id/assign-runner')
  @Roles(Role.CLIENT, Role.ADMIN)
  assignRunner(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignDeliveryRunnerDto,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.deliveryService.assignRunner(
      id,
      dto,
      req.user.userId,
      req.user.roles,
    );
  }

  @Post('orders/:id/payment-session')
  @Roles(Role.CLIENT, Role.ADMIN)
  prepareRunnerPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.deliveryService.prepareRunnerPayment(
      id,
      req.user.userId,
      req.user.roles,
    );
  }

  @Get('orders/:id')
  @Roles(Role.CLIENT, Role.RUNNER, Role.ADMIN)
  getDeliveryOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.deliveryService.getDeliveryOrder(
      id,
      req.user.userId,
      req.user.roles,
    );
  }

  @Get('jobs')
  @Roles(Role.RUNNER, Role.ADMIN)
  listAvailableJobs(@Request() req: { user: UserFromJwt }) {
    const runnerId = req.user.roles.includes(Role.RUNNER)
      ? req.user.userId
      : undefined;
    return this.deliveryService.listAvailableJobs(runnerId);
  }

  @Post('jobs/:id/accept')
  @Roles(Role.RUNNER)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  acceptDeliveryJob(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.deliveryService.acceptDeliveryJob(id, req.user.userId);
  }

  @Post('jobs/expire')
  @Roles(Role.ADMIN)
  expireDeliveryJobs() {
    return this.deliveryService.expireDeliveryJobs();
  }

  @Post('orders/:id/pickup-pending')
  @Roles(Role.RUNNER, Role.ADMIN)
  markPickupPending(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.deliveryService.markPickupPending(
      id,
      req.user.userId,
      req.user.roles,
    );
  }

  @Post('orders/:id/pickup')
  @Roles(Role.RUNNER, Role.ADMIN)
  confirmPickup(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.deliveryService.confirmPickup(
      id,
      req.user.userId,
      req.user.roles,
    );
  }

  @Post('orders/:id/start-transit')
  @Roles(Role.RUNNER, Role.ADMIN)
  startTransit(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.deliveryService.startTransit(
      id,
      req.user.userId,
      req.user.roles,
    );
  }

  @Post('orders/:id/delivered')
  @Roles(Role.RUNNER, Role.ADMIN)
  confirmDelivery(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmDeliveryDto,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.deliveryService.confirmDelivery(
      id,
      req.user.userId,
      req.user.roles,
      dto,
    );
  }

  @Post('orders/:id/location')
  @Roles(Role.RUNNER)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  updateRunnerLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDeliveryLocationDto,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.deliveryService.updateRunnerLocation(
      id,
      req.user.userId,
      req.user.roles,
      dto,
    );
  }

  @Get('orders/:id/tracking')
  @Roles(Role.CLIENT, Role.RUNNER, Role.ADMIN)
  getDeliveryTracking(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.deliveryService.getDeliveryTracking(
      id,
      req.user.userId,
      req.user.roles,
    );
  }

  @Get('orders/:id/location-history')
  @Roles(Role.ADMIN)
  getDeliveryLocationHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.deliveryService.getDeliveryLocationHistory(id);
  }

  @Post('incidents')
  @Roles(Role.CLIENT, Role.RUNNER, Role.PROVIDER, Role.ADMIN)
  createIncident(
    @Body() dto: CreateDeliveryIncidentDto,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.deliveryService.createIncident(
      dto,
      req.user.userId,
      req.user.roles,
    );
  }

  @Get('incidents/:id')
  @Roles(Role.CLIENT, Role.RUNNER, Role.PROVIDER, Role.ADMIN)
  getIncident(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.deliveryService.getIncident(
      id,
      req.user.userId,
      req.user.roles,
    );
  }

  @Get('orders/:id/incidents')
  @Roles(Role.CLIENT, Role.RUNNER, Role.PROVIDER, Role.ADMIN)
  listDeliveryIncidents(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.deliveryService.listDeliveryIncidents(
      id,
      req.user.userId,
      req.user.roles,
    );
  }

  @Patch('incidents/:id/review')
  @Roles(Role.ADMIN)
  reviewIncident(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.deliveryService.reviewIncident(id, req.user.userId);
  }

  @Patch('incidents/:id/resolve')
  @Roles(Role.ADMIN)
  resolveIncident(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.deliveryService.resolveIncident(id, req.user.userId);
  }

  @Patch('incidents/:id/reject')
  @Roles(Role.ADMIN)
  rejectIncident(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.deliveryService.rejectIncident(id, req.user.userId);
  }
}
