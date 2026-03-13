import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
} from 'class-validator';

export class UpsertProviderDto {
  @IsString()
  @IsOptional()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must be url-safe (lowercase letters, numbers, hyphens)',
  })
  slug?: string;

  @IsString()
  @IsNotEmpty()
  businessName: string;

  @IsUUID()
  cityId: string;

  @IsUUID()
  categoryId: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  workshopHistory: string;

  @IsArray()
  @ArrayMaxSize(10)
  @Transform(({ value }) => (Array.isArray(value) ? value : []))
  @IsUrl({}, { each: true })
  photos: string[];

  @IsUrl()
  @IsOptional()
  videoUrl?: string;

  @IsUrl()
  @IsOptional()
  websiteUrl?: string;

  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;
}
