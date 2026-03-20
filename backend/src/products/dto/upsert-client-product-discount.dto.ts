import { IsBoolean, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class UpsertClientProductDiscountDto {
  @IsUUID()
  clientId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  discountPrice!: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
