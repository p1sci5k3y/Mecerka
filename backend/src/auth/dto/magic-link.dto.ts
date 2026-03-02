import { IsEmail, IsNotEmpty, Length, Matches } from 'class-validator';

export class MagicLinkDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class VerifyMagicLinkDto {
  @IsNotEmpty()
  @Length(64, 64)
  @Matches(/^[a-fA-F0-9]{64}$/, { message: 'Formato de token no válido' })
  token: string;
}
