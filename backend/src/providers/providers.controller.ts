import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MfaCompleteGuard } from '../auth/guards/mfa-complete.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '@prisma/client';
import type { RequestWithUser } from '../auth/interfaces/auth.interfaces';
import { ProvidersService } from './providers.service';
import { UpsertProviderDto } from './dto/upsert-provider.dto';

@Controller('providers')
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get('public/:slug')
  getPublicProfile(@Param('slug') slug: string) {
    return this.providersService.getPublicProfile(slug);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, MfaCompleteGuard, RolesGuard)
  @Roles(Role.PROVIDER)
  getOwnProfile(@Request() req: RequestWithUser) {
    return this.providersService.getOwnProfile(req.user.userId);
  }

  @Put('me')
  @UseGuards(JwtAuthGuard, MfaCompleteGuard, RolesGuard)
  @Roles(Role.PROVIDER)
  upsertOwnProfile(
    @Request() req: RequestWithUser,
    @Body() dto: UpsertProviderDto,
  ) {
    return this.providersService.upsertOwnProfile(req.user.userId, dto);
  }

  @Patch('me/publish')
  @UseGuards(JwtAuthGuard, MfaCompleteGuard, RolesGuard)
  @Roles(Role.PROVIDER)
  publishOwnProfile(
    @Request() req: RequestWithUser,
    @Body('isPublished') isPublished: boolean,
  ) {
    return this.providersService.publishOwnProfile(
      req.user.userId,
      isPublished,
    );
  }
}
