import {
  Controller,
  Post,
  Param,
  ParseUUIDPipe,
  ForbiddenException,
  Headers,
} from '@nestjs/common';
import { OrdersService } from '../orders/orders.service';

@Controller('dev/pay')
export class DevPaymentsController {
  constructor(private readonly ordersService: OrdersService) { }

  @Post(':orderId')
  async fakePay(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Headers('x-dev-payment-secret') secret: string,
  ) {
    if (
      process.env.PAYMENT_PROVIDER !== 'fake' ||
      process.env.NODE_ENV === 'production'
    ) {
      throw new ForbiddenException(
        'Dev payment only available in fake mode outside production',
      );
    }

    const expected = process.env.DEV_PAYMENT_SECRET;
    if (!expected || secret !== expected) {
      throw new ForbiddenException('Missing/invalid dev secret');
    }

    const paymentRef = 'fake_' + Date.now();
    return this.ordersService.confirmPayment(orderId, paymentRef, 'dev_evt_' + Date.now());
  }
}
