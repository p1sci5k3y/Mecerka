import {
  Controller,
  Post,
  Param,
  ParseUUIDPipe,
  UseGuards,
  Request,
  Body,
  Header,
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
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('intent/:orderId')
  @Header('Deprecation', 'true')
  @Header(
    'Warning',
    '299 - "Legacy single-provider payment intent endpoint. Use provider-order payment sessions instead."',
  )
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

  @Post('orders/:orderId/provider-sessions')
  @Roles(Role.CLIENT)
  async prepareOrderProviderPayments(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Request() req: RequestWithUser,
  ) {
    return this.paymentsService.prepareOrderProviderPayments(
      orderId,
      req.user.userId,
    );
  }

  @Post('provider-order/:providerOrderId/session')
  @Roles(Role.CLIENT)
  async prepareProviderOrderPayment(
    @Param('providerOrderId', ParseUUIDPipe) providerOrderId: string,
    @Request() req: RequestWithUser,
  ) {
    return this.paymentsService.prepareProviderOrderPayment(
      providerOrderId,
      req.user.userId,
    );
  }

  @Post('cash/:orderId')
  @Header('Deprecation', 'true')
  @Header(
    'Warning',
    '299 - "Legacy cash payment endpoint. Use provider-order payment sessions instead."',
  )
  @Roles(Role.CLIENT)
  async processCash(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body('pin') pin: string,
    @Request() req: RequestWithUser,
  ) {
    return this.paymentsService.processCashPayment(
      orderId,
      req.user.userId,
      pin,
    );
  }
}
