import { IsIn, IsOptional } from 'class-validator';

const OBSERVABILITY_WINDOW_VALUES = ['24h', '7d', '30d'] as const;

export class ObservabilityWindowQueryDto {
  @IsOptional()
  @IsIn(OBSERVABILITY_WINDOW_VALUES)
  window?: (typeof OBSERVABILITY_WINDOW_VALUES)[number];
}
