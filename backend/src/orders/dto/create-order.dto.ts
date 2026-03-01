import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsPositive,
  IsString,
  IsOptional,
  ValidateNested,
  Matches,
  Length,
  IsUUID,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OrderItemDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @IsPositive()
  quantity: number;
}

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @IsString()
  @Matches(/^\d+$/, { message: 'El PIN debe contener solo dígitos.' })
  @Length(4, 6, { message: 'El PIN debe tener entre 4 y 6 dígitos.' })
  pin: string;

  @IsOptional()
  @IsNumber()
  deliveryLat?: number;

  @IsOptional()
  @IsNumber()
  deliveryLng?: number;
}
