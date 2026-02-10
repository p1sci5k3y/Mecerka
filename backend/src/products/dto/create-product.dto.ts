import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  IsUrl,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
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

  @IsInt()
  @Min(0)
  @Type(() => Number)
  stock: number;

  @IsUrl()
  @IsOptional()
  imageUrl?: string;

  @IsInt()
  @Type(() => Number)
  cityId: number;

  @IsInt()
  @Type(() => Number)
  categoryId: number;
}
