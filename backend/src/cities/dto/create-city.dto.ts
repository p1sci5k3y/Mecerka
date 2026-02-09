import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class CreateCityDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug must be url-safe (lowercase letters, numbers, hyphens)',
  })
  slug: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
