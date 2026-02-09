import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
} from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug must be url-safe (lowercase letters, numbers, hyphens)',
  })
  slug: string;

  @IsUrl()
  @IsOptional()
  image_url?: string;
}
