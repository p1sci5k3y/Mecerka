import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Request,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MfaCompleteGuard } from '../auth/guards/mfa-complete.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ProviderOrderStatus, Role } from '@prisma/client';
import type { RequestWithUser } from '../auth/interfaces/auth.interfaces';

@Controller('orders')
@UseGuards(JwtAuthGuard, MfaCompleteGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('available')
  @Roles(Role.RUNNER)
  getAvailableOrders() {
    return this.ordersService.getAvailableOrders();
  }

  @Patch(':id/accept')
  @Roles(Role.RUNNER)
  acceptOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: RequestWithUser,
  ) {
    return this.ordersService.acceptOrder(id, req.user.userId);
  }

  @Patch(':id/complete')
  @Roles(Role.RUNNER)
  completeOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: RequestWithUser,
  ) {
    return this.ordersService.completeOrder(id, req.user.userId);
  }

  @Patch(':id/in-transit')
  @Roles(Role.RUNNER)
  markInTransit(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: RequestWithUser,
  ) {
    return this.ordersService.markInTransit(id, req.user.userId);
  }

  @Patch(':id/cancel')
  @Roles(Role.CLIENT, Role.ADMIN)
  cancelOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: RequestWithUser,
  ) {
    return this.ordersService.cancelOrder(id, req.user.userId, req.user.roles);
  }

  @Get('provider/stats')
  @Roles(Role.PROVIDER)
  getProviderStats(@Request() req: RequestWithUser) {
    return this.ordersService.getProviderStats(req.user.userId);
  }

  @Get('provider/chart')
  @Roles(Role.PROVIDER)
  getProviderSalesChart(@Request() req: RequestWithUser) {
    return this.ordersService.getProviderSalesChart(req.user.userId);
  }

  @Get('provider/top-products')
  @Roles(Role.PROVIDER)
  getProviderTopProducts(@Request() req: RequestWithUser) {
    const uId = String(req.user.userId);
    return this.ordersService.getProviderTopProducts(uId);
  }

  @Patch('provider-order/:id/status')
  @Roles(Role.PROVIDER, Role.RUNNER, Role.ADMIN)
  updateProviderOrderStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: ProviderOrderStatus,
    @Request() req: RequestWithUser,
  ) {
    return this.ordersService.updateProviderOrderStatus(
      id,
      req.user.userId,
      req.user.roles,
      status,
    );
  }

  @Get()
  @Roles(Role.CLIENT, Role.PROVIDER, Role.RUNNER)
  findAll(@Request() req: RequestWithUser) {
    return this.ordersService.findAll(req.user.userId, req.user.roles);
  }

  @Get(':id/tracking')
  @Roles(Role.CLIENT, Role.PROVIDER, Role.RUNNER, Role.ADMIN)
  getTracking(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: RequestWithUser,
  ) {
    return this.ordersService.getOrderTracking(
      id,
      req.user.userId,
      req.user.roles,
    );
  }

  @Get(':id')
  @Roles(Role.CLIENT, Role.PROVIDER, Role.RUNNER, Role.ADMIN)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: RequestWithUser,
  ) {
    return this.ordersService.findOne(id, req.user.userId, req.user.roles);
  }
}
