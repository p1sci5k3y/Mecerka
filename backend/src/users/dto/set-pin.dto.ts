import { IsString, IsNotEmpty, Length } from 'class-validator';

export class SetPinDto {
    @IsString()
    @IsNotEmpty()
    @Length(4, 6, { message: 'El PIN debe tener entre 4 y 6 dígitos.' })
    pin: string;
}
