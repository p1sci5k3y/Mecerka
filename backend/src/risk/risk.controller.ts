import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { Role, RiskActorType } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MfaCompleteGuard } from '../auth/guards/mfa-complete.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RiskService } from './risk.service';

@Controller('risk')
@UseGuards(JwtAuthGuard, MfaCompleteGuard, RolesGuard)
@Roles(Role.ADMIN)
export class RiskController {
  private static readonly DEFAULT_RECENT_EVENT_LIMIT = 10;

  constructor(private readonly riskService: RiskService) {}

  private parseActorType(value: string) {
    if ((Object.values(RiskActorType) as string[]).includes(value)) {
      return value as RiskActorType;
    }

    throw new BadRequestException('Invalid risk actor type');
  }

  private async buildActorRiskResponse(
    actorType: RiskActorType,
    actorId: string,
  ) {
    const [scoreResult, recentEvents] = await Promise.all([
      this.riskService.getActorRiskScore(actorType, actorId),
      this.riskService.listActorRiskEvents(actorType, actorId, {
        limit: RiskController.DEFAULT_RECENT_EVENT_LIMIT,
      }),
    ]);

    return {
      actorId,
      actorType,
      score: scoreResult.snapshot?.score ?? 0,
      level: scoreResult.snapshot?.level ?? 'LOW',
      updatedAt: scoreResult.snapshot?.updatedAt ?? null,
      recentEvents,
      breakdown: scoreResult.breakdown,
    };
  }

  @Get('actors/:actorType/:actorId')
  async getActorRisk(
    @Param('actorType') actorTypeParam: string,
    @Param('actorId', ParseUUIDPipe) actorId: string,
  ) {
    return this.buildActorRiskResponse(
      this.parseActorType(actorTypeParam),
      actorId,
    );
  }

  @Get('high-risk')
  async listHighRiskActors() {
    const snapshots = await this.riskService.listHighRiskActors();

    return Promise.all(
      snapshots.map((snapshot) =>
        this.buildActorRiskResponse(snapshot.actorType, snapshot.actorId),
      ),
    );
  }
}
