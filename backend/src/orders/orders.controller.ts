import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
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
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Roles(Role.CLIENT)
  create(
    @Body() createOrderDto: CreateOrderDto,
    @Request() req: { user: UserFromJwt },
  ) {
    return this.ordersService.create(createOrderDto, req.user.userId);
  }

  @Get()
  @Roles(Role.CLIENT, Role.PROVIDER)
  findAll(@Request() req: { user: UserFromJwt }) {
    return this.ordersService.findAll(req.user.userId, req.user.role);
  }
}
