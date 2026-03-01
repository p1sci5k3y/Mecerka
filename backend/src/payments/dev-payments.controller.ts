import { Controller, Post, Param, ParseUUIDPipe, ForbiddenException } from '@nestjs/common';
import { OrdersService } from '../orders/orders.service';

@Controller('dev/pay')
export class DevPaymentsController {
    constructor(private readonly ordersService: OrdersService) { }

    @Post(':orderId')
    async fakePay(@Param('orderId', ParseUUIDPipe) orderId: string) {
        if (process.env.PAYMENT_PROVIDER !== 'fake' || process.env.NODE_ENV === 'production') {
            throw new ForbiddenException('Dev payment only available in fake mode outside production');
        }

        const paymentRef = 'fake_' + Date.now();
        return this.ordersService.confirmPayment(orderId, paymentRef);
    }
}
