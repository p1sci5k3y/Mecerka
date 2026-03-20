import { ConfigService } from '@nestjs/config';
import { NominatimGeocodingService } from './nominatim-geocoding.service';

describe('NominatimGeocodingService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses built-in demo fixtures when demo mode is enabled', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const service = new NominatimGeocodingService({
      get: jest.fn((key: string) => {
        if (key === 'DEMO_MODE') return 'true';
        return undefined;
      }),
    } as unknown as ConfigService);

    const result = await service.geocodeAddress({
      streetAddress: 'Calle Hombre de Palo, 7',
      postalCode: '45001',
      cityName: 'Toledo',
    });

    expect(result).toEqual({
      latitude: 39.8567,
      longitude: -4.0241,
      formattedAddress: 'Calle Hombre de Palo, 7, 45001 Toledo, Spain',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
