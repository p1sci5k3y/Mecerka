import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CheckoutCartDto } from './dto/checkout-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { OrdersService } from '../orders/orders.service';

@Controller('cart')
@UseGuards(JwtAuthGuard, MfaCompleteGuard, RolesGuard)
export class CartController {
  constructor(
    private readonly cartService: CartService,
    private readonly ordersService: OrdersService,
  ) {}

  @Get('me')
  @Roles(Role.CLIENT)
  getMyActiveCart(@Request() req: RequestWithUser) {
    return this.cartService.getOrCreateActiveCartGroup(req.user.userId);
  }

  @Post('items')
  @Roles(Role.CLIENT)
  addItem(@Request() req: RequestWithUser, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(req.user.userId, dto);
  }

  @Patch('items/:itemId')
  @Roles(Role.CLIENT)
  updateItemQuantity(
    @Request() req: RequestWithUser,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItemQuantity(req.user.userId, itemId, dto);
  }

  @Delete('items/:itemId')
  @Roles(Role.CLIENT)
  removeItem(
    @Request() req: RequestWithUser,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.cartService.removeItem(req.user.userId, itemId);
  }

  @Post('checkout')
  @Roles(Role.CLIENT)
  checkout(
    @Request() req: RequestWithUser,
    @Body() dto: CheckoutCartDto,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ) {
    return this.ordersService.checkoutFromCart(
      req.user.userId,
      dto,
      idempotencyKey,
    );
  }
}
