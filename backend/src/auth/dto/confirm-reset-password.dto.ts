import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ConfirmResetPasswordDto {
    @IsString()
    @IsNotEmpty()
    token: string;

    @IsString()
    @IsNotEmpty()
    @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
    newPassword: string;
}
