import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class UpdateCartItemDto {
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  quantity: number;
}
