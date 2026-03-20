import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GEOCODING_SERVICE } from './geocoding.constants';
import { NominatimGeocodingService } from './nominatim-geocoding.service';

@Module({
  imports: [ConfigModule],
  providers: [
    NominatimGeocodingService,
    {
      provide: GEOCODING_SERVICE,
      useExisting: NominatimGeocodingService,
    },
  ],
  exports: [GEOCODING_SERVICE],
})
export class GeocodingModule {}
