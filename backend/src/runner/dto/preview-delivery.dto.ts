import { IsNumber, IsNotEmpty, IsLatitude, IsLongitude } from 'class-validator';

export class PreviewDeliveryDto {
  @IsNumber()
  @IsLatitude()
  @IsNotEmpty()
  lat: number;

  @IsNumber()
  @IsLongitude()
  @IsNotEmpty()
  lng: number;
}
