export const IncidentReporterRoleValues = {
  CLIENT: 'CLIENT',
  RUNNER: 'RUNNER',
  PROVIDER: 'PROVIDER',
  ADMIN: 'ADMIN',
} as const;

export type IncidentReporterRoleValue =
  (typeof IncidentReporterRoleValues)[keyof typeof IncidentReporterRoleValues];

export const DeliveryIncidentTypeValues = {
  MISSING_ITEMS: 'MISSING_ITEMS',
  DAMAGED_ITEMS: 'DAMAGED_ITEMS',
  WRONG_DELIVERY: 'WRONG_DELIVERY',
  FAILED_DELIVERY: 'FAILED_DELIVERY',
  ADDRESS_PROBLEM: 'ADDRESS_PROBLEM',
  SAFETY_CONCERN: 'SAFETY_CONCERN',
  OTHER: 'OTHER',
} as const;

export type DeliveryIncidentTypeValue =
  (typeof DeliveryIncidentTypeValues)[keyof typeof DeliveryIncidentTypeValues];

export const DeliveryIncidentStatusValues = {
  OPEN: 'OPEN',
  UNDER_REVIEW: 'UNDER_REVIEW',
  RESOLVED: 'RESOLVED',
  REJECTED: 'REJECTED',
} as const;

export type DeliveryIncidentStatusValue =
  (typeof DeliveryIncidentStatusValues)[keyof typeof DeliveryIncidentStatusValues];
