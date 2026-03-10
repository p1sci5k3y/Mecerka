import {
  Controller,
  Get,
  UseGuards,
  Request,
  Res,
  Query,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MfaCompleteGuard } from '../auth/guards/mfa-complete.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import type { RequestWithUser } from '../auth/interfaces/auth.interfaces';
import type { Response } from 'express';

@Controller('payments/connect')
export class OnboardingController {
  private readonly logger = new Logger(OnboardingController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('link')
  @UseGuards(JwtAuthGuard, MfaCompleteGuard, RolesGuard)
  @Roles(Role.PROVIDER, Role.RUNNER)
  async getConnectLink(@Request() req: RequestWithUser) {
    const url = await this.paymentsService.generateOnboardingLink(
      req.user.userId,
    );
    return { url };
  }

  @Get('callback')
  @UseGuards(JwtAuthGuard, MfaCompleteGuard, RolesGuard)
  @Roles(Role.PROVIDER, Role.RUNNER)
  async handleStripeCallback(
    @Request() req: RequestWithUser,
    @Query('accountId') accountId: string,
    @Res() res: Response,
  ) {
    if (!accountId) {
      throw new BadRequestException(
        'Missing accountId from Stripe OAuth return',
      );
    }

    try {
      await this.paymentsService.verifyAndSaveConnectedAccount(
        req.user.userId,
        accountId,
      );
      // Redirect back to frontend dashboard settings with success flag
      return res.redirect(
        `${process.env.FRONTEND_URL || 'http://localhost:3001'}/dashboard?stripe_connected=true`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to verify connected account for user ${req.user.userId}:`,
        error,
      );
      return res.redirect(
        `${process.env.FRONTEND_URL || 'http://localhost:3001'}/dashboard?stripe_connected=false&error=verification_failed`,
      );
    }
  }
}
