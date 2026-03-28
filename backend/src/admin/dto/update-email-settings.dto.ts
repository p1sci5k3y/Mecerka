import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateEmailSettingsDto {
  @IsIn(['SMTP', 'AWS_SES'])
  connectorType: 'SMTP' | 'AWS_SES';

  @IsOptional()
  @IsString()
  host?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsString()
  user?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsBoolean()
  clearSecret?: boolean;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  accessKeyId?: string;

  @IsOptional()
  @IsString()
  secretAccessKey?: string;

  @IsOptional()
  @IsString()
  sessionToken?: string;

  @IsOptional()
  @IsBoolean()
  clearSessionToken?: boolean;

  @IsOptional()
  @IsString()
  endpoint?: string;

  @IsString()
  from: string;
}

export class SendTestEmailDto {
  @IsEmail()
  recipient: string;
}
