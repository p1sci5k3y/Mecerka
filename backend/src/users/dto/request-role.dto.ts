import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  Validate,
} from 'class-validator';
import { IsSpanishFiscalIdConstraint } from '../validators/is-spanish-fiscal-id.validator';

export enum RequestableRole {
  PROVIDER = 'PROVIDER',
  RUNNER = 'RUNNER',
}

export class RequestRoleDto {
  @IsEnum(RequestableRole)
  role: RequestableRole;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/, {
    message: 'country must be a two-letter ISO country code',
  })
  country: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @Validate(IsSpanishFiscalIdConstraint)
  fiscalId: string;
}
