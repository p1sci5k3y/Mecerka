import {
  Body,
  Controller,
  Get,
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
import { RequestRefundDto } from './dto/request-refund.dto';
import { RefundsService } from './refunds.service';

@Controller('refunds')
@UseGuards(JwtAuthGuard, MfaCompleteGuard, RolesGuard)
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @Post()
  @Roles(Role.CLIENT, Role.ADMIN)
  requestRefund(
    @Body() dto: RequestRefundDto,
    @Request() req: RequestWithUser,
  ) {
    return this.refundsService.requestRefund(
      dto,
      req.user.userId,
      req.user.roles,
    );
  }

  @Get(':id')
  @Roles(Role.CLIENT, Role.PROVIDER, Role.ADMIN)
  getRefund(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: RequestWithUser,
  ) {
    return this.refundsService.getRefund(id, req.user.userId, req.user.roles);
  }

  @Get('provider-order/:providerOrderId')
  @Roles(Role.CLIENT, Role.PROVIDER, Role.ADMIN)
  listProviderOrderRefunds(
    @Param('providerOrderId', ParseUUIDPipe) providerOrderId: string,
    @Request() req: RequestWithUser,
  ) {
    return this.refundsService.listProviderOrderRefunds(
      providerOrderId,
      req.user.userId,
      req.user.roles,
    );
  }

  @Get('delivery-order/:deliveryOrderId')
  @Roles(Role.CLIENT, Role.ADMIN)
  listDeliveryOrderRefunds(
    @Param('deliveryOrderId', ParseUUIDPipe) deliveryOrderId: string,
    @Request() req: RequestWithUser,
  ) {
    return this.refundsService.listDeliveryOrderRefunds(
      deliveryOrderId,
      req.user.userId,
      req.user.roles,
    );
  }

  @Patch(':id/review')
  @Roles(Role.ADMIN)
  reviewRefund(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: RequestWithUser,
  ) {
    return this.refundsService.reviewRefund(
      id,
      req.user.userId,
      req.user.roles,
    );
  }

  @Patch(':id/approve')
  @Roles(Role.ADMIN)
  approveRefund(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: RequestWithUser,
  ) {
    return this.refundsService.approveRefund(
      id,
      req.user.userId,
      req.user.roles,
    );
  }

  @Patch(':id/reject')
  @Roles(Role.ADMIN)
  rejectRefund(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: RequestWithUser,
  ) {
    return this.refundsService.rejectRefund(
      id,
      req.user.userId,
      req.user.roles,
    );
  }

  @Post(':id/execute')
  @Roles(Role.ADMIN)
  executeRefund(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: RequestWithUser,
  ) {
    return this.refundsService.executeRefund(
      id,
      req.user.userId,
      req.user.roles,
    );
  }
}
