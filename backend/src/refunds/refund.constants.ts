export const RefundTypeValues = {
  PROVIDER_FULL: 'PROVIDER_FULL',
  PROVIDER_PARTIAL: 'PROVIDER_PARTIAL',
  DELIVERY_FULL: 'DELIVERY_FULL',
  DELIVERY_PARTIAL: 'DELIVERY_PARTIAL',
} as const;

export type RefundTypeValue =
  (typeof RefundTypeValues)[keyof typeof RefundTypeValues];

export const RefundStatusValues = {
  REQUESTED: 'REQUESTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  EXECUTING: 'EXECUTING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type RefundStatusValue =
  (typeof RefundStatusValues)[keyof typeof RefundStatusValues];
