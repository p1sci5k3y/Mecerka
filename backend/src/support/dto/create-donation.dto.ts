import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateDonationDto {
  @Type(() => Number)
  @IsNumber(
    { allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 },
    { message: 'amount must be a valid number with up to 2 decimal places' },
  )
  @Min(1)
  @Max(500)
  amount!: number;

  @Transform(({ value }) => String(value).toUpperCase())
  @IsString()
  @Length(3, 3)
  @IsIn(['EUR'])
  currency!: string;

  @IsOptional()
  @IsString()
  provider?: string;
}
