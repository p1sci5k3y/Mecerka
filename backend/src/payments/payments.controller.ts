import {
    Controller,
    Post,
    Param,
    ParseUUIDPipe,
    UseGuards,
    Request,
    Body,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MfaCompleteGuard } from '../auth/guards/mfa-complete.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import type { RequestWithUser } from '../auth/interfaces/auth.interfaces';

@Controller('payments')
@UseGuards(JwtAuthGuard, MfaCompleteGuard, RolesGuard)
export class PaymentsController {
    constructor(private readonly paymentsService: PaymentsService) { }

    @Post('intent/:orderId')
    @Roles(Role.CLIENT)
    async createIntent(
        @Param('orderId', ParseUUIDPipe) orderId: string,
        @Request() req: RequestWithUser,
    ) {
        return this.paymentsService.createTripartitePaymentIntent(
            orderId,
            req.user.userId,
        );
    }

    @Post('cash/:orderId')
    @Roles(Role.CLIENT)
    async processCash(
        @Param('orderId', ParseUUIDPipe) orderId: string,
        @Body('pin') pin: string,
        @Request() req: RequestWithUser,
    ) {
        return this.paymentsService.processCashPayment(orderId, req.user.userId, pin);
    }
}
