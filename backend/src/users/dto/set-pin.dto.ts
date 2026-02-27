import { IsString, IsNotEmpty, Length, Matches } from 'class-validator';

export class SetPinDto {
    @IsString()
    @IsNotEmpty()
    @Matches(/^\d+$/, { message: 'El PIN debe contener solo dígitos.' })
    @Length(4, 6, { message: 'El PIN debe tener entre 4 y 6 dígitos.' })
    pin: string;
}
