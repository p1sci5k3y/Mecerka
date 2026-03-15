import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DeliveryIncidentTypeValues } from '../delivery-incident.constants';
import type { DeliveryIncidentTypeValue } from '../delivery-incident.constants';

export class CreateDeliveryIncidentDto {
  @IsUUID()
  deliveryOrderId!: string;

  @IsEnum(DeliveryIncidentTypeValues)
  type!: DeliveryIncidentTypeValue;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  description!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  evidenceUrl?: string;
}
