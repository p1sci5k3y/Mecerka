import { Injectable } from '@nestjs/common';
import { Prisma, RiskActorType, RiskCategory, RiskLevel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  GetActorRiskScoreResult,
  ListActorRiskEventsInput,
  ListHighRiskActorsInput,
  RISK_CATEGORY_RULES,
  RISK_LEVEL_THRESHOLDS,
  RecalculateRiskScoreResult,
  RecordRiskEventInput,
  RecordRiskEventResult,
  RiskCategoryBreakdown,
  RiskMetadata,
} from './risk.types';

@Injectable()
export class RiskService {
  private static readonly MAX_METADATA_KEYS = 12;
  private static readonly MAX_METADATA_STRING_LENGTH = 128;
  private static readonly MAX_LIST_LIMIT = 100;
  private static readonly DEFAULT_LIST_LIMIT = 25;
  private static readonly EVENT_RETENTION_DAYS = 90;
  private static readonly DISALLOWED_METADATA_KEY_PATTERN =
    /(address|lat|lng|lon|coord|location|payload|body|token|secret|password|authorization|email|phone|name|raw)/i;
  private static readonly ALLOWED_METADATA_KEY_PATTERN =
    /(id|type|status|category|reason|code|count|attempt|provider|event)$/i;

  constructor(private readonly prisma: PrismaService) {}

  private normalizeScore(category: RiskCategory, score?: number) {
    const fallback = RISK_CATEGORY_RULES[category].defaultScore;
    const normalized = Number.isFinite(score)
      ? Math.trunc(Number(score))
      : fallback;
    return Math.max(0, Math.min(normalized, 100));
  }

  private sanitizeMetadata(
    metadata?: RiskMetadata,
  ): Prisma.InputJsonValue | undefined {
    if (!metadata) {
      return undefined;
    }

    const sanitizedEntries = Object.entries(metadata)
      .filter(([key]) => {
        return (
          !RiskService.DISALLOWED_METADATA_KEY_PATTERN.test(key) &&
          RiskService.ALLOWED_METADATA_KEY_PATTERN.test(key)
        );
      })
      .slice(0, RiskService.MAX_METADATA_KEYS)
      .map(([key, value]) => [key, this.sanitizeMetadataValue(value)] as const)
      .filter(([, value]) => value !== undefined);

    if (sanitizedEntries.length === 0) {
      return undefined;
    }

    return Object.fromEntries(sanitizedEntries) as Prisma.InputJsonObject;
  }

  private sanitizeMetadataValue(
    value: RiskMetadata[keyof RiskMetadata],
  ): Prisma.InputJsonValue | undefined {
    if (value === null) {
      return undefined;
    }

    if (typeof value === 'string') {
      return value.slice(0, RiskService.MAX_METADATA_STRING_LENGTH);
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : undefined;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (Array.isArray(value)) {
      const sanitized: Prisma.InputJsonValue[] = value
        .slice(0, 10)
        .map((entry) => this.sanitizeMetadataValue(entry))
        .filter((entry): entry is Prisma.InputJsonValue => entry !== undefined);

      return sanitized.length > 0 ? sanitized : undefined;
    }

    return undefined;
  }

  private getOldestRelevantDate(now: Date) {
    const maxWindowDays = Math.max(
      ...Object.values(RISK_CATEGORY_RULES).map((rule) => rule.windowDays),
    );

    return new Date(now.getTime() - maxWindowDays * 24 * 60 * 60 * 1000);
  }

  private computeRiskLevel(score: number) {
    if (score >= RISK_LEVEL_THRESHOLDS.CRITICAL) {
      return RiskLevel.CRITICAL;
    }

    if (score >= RISK_LEVEL_THRESHOLDS.HIGH) {
      return RiskLevel.HIGH;
    }

    if (score >= RISK_LEVEL_THRESHOLDS.MEDIUM) {
      return RiskLevel.MEDIUM;
    }

    return RiskLevel.LOW;
  }

  private buildBreakdown(
    events: Array<{ category: RiskCategory; score: number; createdAt: Date }>,
    now: Date,
  ) {
    const breakdown: RiskCategoryBreakdown[] = [];

    for (const category of Object.values(RiskCategory)) {
      const rule = RISK_CATEGORY_RULES[category];
      const windowStart = new Date(
        now.getTime() - rule.windowDays * 24 * 60 * 60 * 1000,
      );
      const categoryEvents = events.filter(
        (event) =>
          event.category === category &&
          event.createdAt.getTime() >= windowStart.getTime(),
      );
      const rawScore = categoryEvents.reduce(
        (sum, event) => sum + event.score,
        0,
      );
      const contribution = Math.min(rawScore, rule.maxContribution);

      if (rawScore === 0 && categoryEvents.length === 0) {
        continue;
      }

      breakdown.push({
        category,
        windowDays: rule.windowDays,
        rawScore,
        contribution,
        eventCount: categoryEvents.length,
      });
    }

    return breakdown.sort(
      (left, right) => right.contribution - left.contribution,
    );
  }

  private normalizeLimit(limit?: number) {
    const normalized = Number.isFinite(limit)
      ? Math.trunc(Number(limit))
      : RiskService.DEFAULT_LIST_LIMIT;
    return Math.max(1, Math.min(normalized, RiskService.MAX_LIST_LIMIT));
  }

  async recordRiskEvent(
    input: RecordRiskEventInput,
  ): Promise<RecordRiskEventResult> {
    const normalizedScore = this.normalizeScore(input.category, input.score);
    const metadata = this.sanitizeMetadata(input.metadata);

    if (input.dedupKey) {
      try {
        const event = await this.prisma.riskEvent.create({
          data: {
            actorType: input.actorType,
            actorId: input.actorId,
            category: input.category,
            score: normalizedScore,
            metadata,
            dedupKey: input.dedupKey,
          },
        });

        return { event, created: true };
      } catch (error: unknown) {
        if ((error as { code?: string })?.code === 'P2002') {
          const existing = await this.prisma.riskEvent.findUniqueOrThrow({
            where: { dedupKey: input.dedupKey },
          });

          return { event: existing, created: false };
        }

        throw error;
      }
    }

    const event = await this.prisma.riskEvent.create({
      data: {
        actorType: input.actorType,
        actorId: input.actorId,
        category: input.category,
        score: normalizedScore,
        metadata,
      },
    });

    return { event, created: true };
  }

  async recalculateRiskScore(
    actorType: RiskActorType,
    actorId: string,
    now = new Date(),
  ): Promise<RecalculateRiskScoreResult> {
    const events = await this.prisma.riskEvent.findMany({
      where: {
        actorType,
        actorId,
        createdAt: {
          gte: this.getOldestRelevantDate(now),
        },
      },
      select: {
        category: true,
        score: true,
        createdAt: true,
      },
    });

    const breakdown = this.buildBreakdown(events, now);
    const score = Math.min(
      100,
      breakdown.reduce((sum, item) => sum + item.contribution, 0),
    );
    const level = this.computeRiskLevel(score);

    const snapshot = await this.prisma.riskScoreSnapshot.upsert({
      where: {
        actorType_actorId: {
          actorType,
          actorId,
        },
      },
      update: {
        score,
        level,
      },
      create: {
        actorType,
        actorId,
        score,
        level,
      },
    });

    return { snapshot, breakdown };
  }

  async getActorRiskScore(
    actorType: RiskActorType,
    actorId: string,
    now = new Date(),
  ): Promise<GetActorRiskScoreResult> {
    const [snapshot, events] = await Promise.all([
      this.prisma.riskScoreSnapshot.findUnique({
        where: {
          actorType_actorId: {
            actorType,
            actorId,
          },
        },
      }),
      this.prisma.riskEvent.findMany({
        where: {
          actorType,
          actorId,
          createdAt: {
            gte: this.getOldestRelevantDate(now),
          },
        },
        select: {
          category: true,
          score: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      snapshot,
      breakdown: this.buildBreakdown(events, now),
    };
  }

  async listHighRiskActors(input: ListHighRiskActorsInput = {}) {
    const minimumLevel = input.minimumLevel ?? RiskLevel.HIGH;
    const orderedLevels = [
      RiskLevel.LOW,
      RiskLevel.MEDIUM,
      RiskLevel.HIGH,
      RiskLevel.CRITICAL,
    ];
    const minimumIndex = orderedLevels.indexOf(minimumLevel);
    const includedLevels = orderedLevels.slice(Math.max(minimumIndex, 0));

    return this.prisma.riskScoreSnapshot.findMany({
      where: {
        level: {
          in: includedLevels,
        },
      },
      orderBy: [{ score: 'desc' }, { updatedAt: 'desc' }],
      take: this.normalizeLimit(input.limit),
    });
  }

  async listActorRiskEvents(
    actorType: RiskActorType,
    actorId: string,
    input: ListActorRiskEventsInput = {},
  ) {
    return this.prisma.riskEvent.findMany({
      where: {
        actorType,
        actorId,
        ...(input.category ? { category: input.category } : {}),
        ...(input.since ? { createdAt: { gte: input.since } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: this.normalizeLimit(input.limit),
    });
  }

  async cleanupOldRiskEvents(now = new Date()) {
    const cutoff = new Date(
      now.getTime() - RiskService.EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    const result = await this.prisma.riskEvent.deleteMany({
      where: {
        createdAt: {
          lt: cutoff,
        },
      },
    });

    return {
      deletedCount: result.count,
      cutoff,
    };
  }
}
