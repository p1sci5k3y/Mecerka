import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MfaCompleteGuard } from '../auth/guards/mfa-complete.guard';
import type { RequestWithUser } from '../auth/interfaces/auth.interfaces';
import { CreateDonationDto } from './dto/create-donation.dto';
import { SupportService } from './support.service';

@Controller('support/donations')
@UseGuards(JwtAuthGuard, MfaCompleteGuard)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  createDonation(
    @Body() dto: CreateDonationDto,
    @Request() req: RequestWithUser,
  ) {
    return this.supportService.createDonation(
      dto.amount,
      dto.currency,
      req.user.userId,
    );
  }

  @Post(':id/session')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  prepareDonationPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: RequestWithUser,
  ) {
    return this.supportService.prepareDonationPayment(id, req.user.userId);
  }

  @Get(':id')
  getDonation(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: RequestWithUser,
  ) {
    return this.supportService.getDonation(id, req.user.userId);
  }
}
