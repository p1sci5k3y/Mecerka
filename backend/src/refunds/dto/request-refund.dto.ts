import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { RefundTypeValues } from '../refund.constants';
import type { RefundTypeValue } from '../refund.constants';

export class RequestRefundDto {
  @IsOptional()
  @IsUUID()
  incidentId?: string;

  @IsOptional()
  @IsUUID()
  providerOrderId?: string;

  @IsOptional()
  @IsUUID()
  deliveryOrderId?: string;

  @IsEnum(RefundTypeValues)
  type!: RefundTypeValue;

  @Transform(({ value }) =>
    typeof value === 'string' ? Number.parseFloat(value) : value,
  )
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100000)
  amount!: number;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
}
