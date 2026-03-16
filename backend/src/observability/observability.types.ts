import { RiskLevel } from '@prisma/client';

export const OBSERVABILITY_WINDOWS = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
} as const;

export type ObservabilityWindow = keyof typeof OBSERVABILITY_WINDOWS;

export const DEFAULT_OBSERVABILITY_WINDOW: ObservabilityWindow = '24h';

export type ObservabilityMetrics = {
  window: ObservabilityWindow;
  windowStart: Date;
  generatedAt: Date;
  orders: {
    total: number;
    created: number;
    completed: number;
    cancelled: number;
    refunded: number;
  };
  delivery: {
    created: number;
    completed: number;
    failed: number;
    averageCompletionTimeMs: number | null;
    failureRate: number;
  };
  refunds: {
    created: number;
    approved: number;
    rejected: number;
    approvalRatio: number;
  };
  incidents: {
    created: number;
    resolved: number;
    open: number;
  };
  risk: {
    high: number;
    critical: number;
  };
};

export type ObservabilitySlaMetrics = {
  window: ObservabilityWindow;
  windowStart: Date;
  generatedAt: Date;
  averageDeliveryCompletionTimeMs: number | null;
  medianDeliveryCompletionTimeMs: number | null;
  deliverySuccessRate: number;
  deliveryFailureRate: number;
  completedDeliveriesCount: number;
  failedDeliveriesCount: number;
};

export type ReconciliationCheckStatus = 'OK' | 'WARNING' | 'ERROR';

export type ReconciliationCheckResult = {
  checkName: string;
  status: ReconciliationCheckStatus;
  affectedCount: number;
  sampleIds: string[];
  checkedAt: Date;
};

export type ObservabilityReconciliation = {
  window: ObservabilityWindow;
  windowStart: Date;
  checkedAt: Date;
  checks: ReconciliationCheckResult[];
};

export const HIGH_RISK_LEVELS: RiskLevel[] = [
  RiskLevel.HIGH,
  RiskLevel.CRITICAL,
];
