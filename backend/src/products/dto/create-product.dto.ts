import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  IsUrl,
  IsUUID,
  Matches,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsString()
  @IsOptional()
  @Matches(/^[A-Za-z0-9._-]+$/, {
    message:
      'reference may only contain letters, numbers, dots, underscores and hyphens',
  })
  reference?: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  price: number;

  @ValidateIf((o) => o.discountPrice !== undefined && o.discountPrice !== null)
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  discountPrice?: number;

  @IsInt()
  @Min(0)
  @Type(() => Number)
  stock: number;

  @IsUrl()
  @IsOptional()
  imageUrl?: string;

  @IsUUID()
  cityId: string;

  @IsUUID()
  categoryId: string;
}
