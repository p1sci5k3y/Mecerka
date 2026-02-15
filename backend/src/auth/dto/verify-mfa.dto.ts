import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class VerifyMfaDto {
    @IsString()
    @IsNotEmpty()
    @Matches(/^\d{6}$/, { message: 'Token must be a 6-digit number' })
    token: string;
}
