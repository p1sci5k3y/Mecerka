import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateClientProductDiscountDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  discountPrice?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
