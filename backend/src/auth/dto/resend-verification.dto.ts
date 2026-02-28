import { IsEmail, IsNotEmpty } from 'class-validator';

export class ResendVerificationDto {
    @IsEmail({}, { message: 'Must be a valid email address' })
    @IsNotEmpty({ message: 'Email is required' })
    email: string;
}
