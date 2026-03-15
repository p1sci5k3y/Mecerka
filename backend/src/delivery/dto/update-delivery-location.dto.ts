import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

export class UpdateDeliveryLocationDto {
  @Type(() => Number)
  @IsNumber(
    { allowInfinity: false, allowNaN: false, maxDecimalPlaces: 6 },
    { message: 'latitude must be a valid number' },
  )
  @Min(-90)
  @Max(90)
  latitude!: number;

  @Type(() => Number)
  @IsNumber(
    { allowInfinity: false, allowNaN: false, maxDecimalPlaces: 6 },
    { message: 'longitude must be a valid number' },
  )
  @Min(-180)
  @Max(180)
  longitude!: number;
}
