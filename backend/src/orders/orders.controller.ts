import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  UseGuards,
  Request,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { UserFromJwt } from '../auth/interfaces/auth.interfaces';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) { }

  @Post()
  @Roles(Role.CLIENT)
  create(
    @Body() createOrderDto: CreateOrderDto,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.ordersService.create(createOrderDto, req.user.userId);
  }

  @Get('available')
  @Roles(Role.RUNNER)
  getAvailableOrders() {
    return this.ordersService.getAvailableOrders();
  }

  @Patch(':id/accept')
  @Roles(Role.RUNNER)
  acceptOrder(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.ordersService.acceptOrder(id, req.user.userId);
  }

  @Patch(':id/complete')
  @Roles(Role.RUNNER)
  completeOrder(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.ordersService.completeOrder(id, req.user.userId);
  }

  @Get('provider/stats')
  @Roles(Role.PROVIDER)
  getProviderStats(@Request() req: { user: UserFromJwt }) {
    return this.ordersService.getProviderStats(req.user.userId);
  }

  @Get('provider/chart')
  @Roles(Role.PROVIDER)
  getProviderSalesChart(@Request() req: { user: UserFromJwt }) {
    return this.ordersService.getProviderSalesChart(req.user.userId);
  }

  @Get('provider/top-products')
  @Roles(Role.PROVIDER)
  getProviderTopProducts(@Request() req: { user: UserFromJwt }) {
    return this.ordersService.getProviderTopProducts(req.user.userId);
  }

  @Get()
  @Roles(Role.CLIENT, Role.PROVIDER, Role.RUNNER)
  findAll(@Request() req: { user: UserFromJwt }) {
    return this.ordersService.findAll(req.user.userId, req.user.roles);
  }

  @Get(':id')
  @Roles(Role.CLIENT, Role.PROVIDER, Role.RUNNER, Role.ADMIN)
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.ordersService.findOne(id, req.user.userId, req.user.roles);
  }
}
