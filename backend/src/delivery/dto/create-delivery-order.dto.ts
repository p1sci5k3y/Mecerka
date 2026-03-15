import { Transform, Type } from 'class-transformer';
import { IsIn, IsNumber, IsUUID, Max, Min } from 'class-validator';

export class CreateDeliveryOrderDto {
  @IsUUID()
  orderId!: string;

  @Type(() => Number)
  @IsNumber(
    { allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 },
    {
      message: 'deliveryFee must be a valid number with up to 2 decimal places',
    },
  )
  @Min(0)
  @Max(500)
  deliveryFee!: number;

  @Transform(({ value }) => String(value ?? 'EUR').toUpperCase())
  @IsIn(['EUR'])
  currency!: string;
}
