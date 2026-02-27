import { IsEmail, IsString, IsNotEmpty } from 'class-validator';

export class MagicLinkDto {
    @IsEmail()
    @IsNotEmpty()
    email: string;
}

export class VerifyMagicLinkDto {
    @IsString()
    @IsNotEmpty()
    token: string;
}
