import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';

export class CatalogFormatQueryDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() : 'csv',
  )
  @IsIn(['csv', 'xlsx'])
  format: 'csv' | 'xlsx' = 'csv';
}
