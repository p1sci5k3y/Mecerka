import {
  RiskActorType,
  RiskCategory,
  RiskEvent,
  RiskLevel,
  RiskScoreSnapshot,
} from '@prisma/client';

export const RISK_LEVEL_THRESHOLDS = {
  MEDIUM: 20,
  HIGH: 50,
  CRITICAL: 80,
} as const;

export type RiskCategoryRule = {
  windowDays: number;
  maxContribution: number;
  defaultScore: number;
};

export const RISK_CATEGORY_RULES: Record<RiskCategory, RiskCategoryRule> = {
  EXCESSIVE_REFUNDS: {
    windowDays: 30,
    maxContribution: 40,
    defaultScore: 12,
  },
  EXCESSIVE_INCIDENTS: {
    windowDays: 30,
    maxContribution: 35,
    defaultScore: 10,
  },
  EXCESSIVE_CANCELLATIONS: {
    windowDays: 14,
    maxContribution: 25,
    defaultScore: 8,
  },
  RUNNER_GPS_ANOMALY: {
    windowDays: 7,
    maxContribution: 45,
    defaultScore: 15,
  },
  RUNNER_JOB_GRABBING: {
    windowDays: 7,
    maxContribution: 35,
    defaultScore: 12,
  },
  PROVIDER_REJECTION_SPIKE: {
    windowDays: 14,
    maxContribution: 40,
    defaultScore: 10,
  },
  CLIENT_REFUND_ABUSE: {
    windowDays: 30,
    maxContribution: 45,
    defaultScore: 15,
  },
  CLIENT_INCIDENT_ABUSE: {
    windowDays: 30,
    maxContribution: 35,
    defaultScore: 10,
  },
  DELIVERY_FAILURE_PATTERN: {
    windowDays: 14,
    maxContribution: 40,
    defaultScore: 10,
  },
  PAYMENT_FAILURE_PATTERN: {
    windowDays: 14,
    maxContribution: 30,
    defaultScore: 10,
  },
  OTHER: {
    windowDays: 30,
    maxContribution: 20,
    defaultScore: 5,
  },
};

export type RiskMetadataValue =
  | string
  | number
  | boolean
  | null
  | Array<string | number | boolean | null>;

export type RiskMetadata = Record<string, RiskMetadataValue>;

export type RecordRiskEventInput = {
  actorType: RiskActorType;
  actorId: string;
  category: RiskCategory;
  score?: number;
  metadata?: RiskMetadata;
  dedupKey?: string;
};

export type RecordRiskEventResult = {
  event: RiskEvent;
  created: boolean;
};

export type RiskCategoryBreakdown = {
  category: RiskCategory;
  windowDays: number;
  rawScore: number;
  contribution: number;
  eventCount: number;
};

export type RecalculateRiskScoreResult = {
  snapshot: RiskScoreSnapshot;
  breakdown: RiskCategoryBreakdown[];
};

export type GetActorRiskScoreResult = {
  snapshot: RiskScoreSnapshot | null;
  breakdown: RiskCategoryBreakdown[];
};

export type ListHighRiskActorsInput = {
  minimumLevel?: RiskLevel;
  limit?: number;
};

export type ListActorRiskEventsInput = {
  category?: RiskCategory;
  limit?: number;
  since?: Date;
};
