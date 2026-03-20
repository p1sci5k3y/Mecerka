import { Transform, Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CheckoutCartDto {
  @IsUUID()
  cityId!: string;

  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @Length(5, 200)
  deliveryAddress!: string;

  @Transform(({ value }) =>
    String(value ?? '')
      .trim()
      .toUpperCase(),
  )
  @IsString()
  @Matches(/^[A-Z0-9 -]{4,12}$/, {
    message: 'postalCode must be a valid postal code',
  })
  postalCode!: string;

  @Transform(({ value }) => {
    const normalized = String(value ?? '').trim();
    return normalized.length > 0 ? normalized : undefined;
  })
  @IsOptional()
  @IsString()
  @Length(1, 160)
  addressReference?: string;

  @Type(() => Number)
  @IsNumber(
    { allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 },
    { message: 'discoveryRadiusKm must be a valid number' },
  )
  @Min(0.5)
  @Max(100)
  discoveryRadiusKm!: number;
}
