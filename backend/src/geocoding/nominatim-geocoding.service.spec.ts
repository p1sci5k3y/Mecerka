import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NominatimGeocodingService } from './nominatim-geocoding.service';

const makeService = (overrides: Record<string, string | undefined> = {}) =>
  new NominatimGeocodingService({
    get: jest.fn((key: string) => overrides[key]),
  } as unknown as ConfigService);

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

  // ─── branch coverage additions ──────────────────────────────────────────

  describe('branch coverage', () => {
    // DEMO_MODE true but fixture not found → falls through to fetch
    it('returns null from demo mode when fixture is not found', async () => {
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => [],
      } as any);

      const service = makeService({ DEMO_MODE: 'true' });

      const result = await service.geocodeAddress({
        streetAddress: 'Calle Inexistente, 1',
        postalCode: '12345',
        cityName: 'Inexistente',
      });

      // Fixture not found → fetch is called → empty payload → null returned
      expect(fetchMock).toHaveBeenCalled();
      expect(result).toBeNull();
    });

    // DEMO_MODE is not 'true' → fetch is called
    it('calls fetch when DEMO_MODE is not enabled', async () => {
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => [
          {
            lat: '40.4168',
            lon: '-3.7038',
            display_name: 'Madrid',
            address: { postcode: '28013' },
          },
        ],
      } as any);

      const service = makeService({ DEMO_MODE: 'false' });

      const result = await service.geocodeAddress({
        streetAddress: 'Calle Mayor 1',
        postalCode: '28013',
        cityName: 'Madrid',
      });

      expect(fetchMock).toHaveBeenCalled();
      expect(result).toMatchObject({ latitude: 40.4168, longitude: -3.7038 });
    });

    // fetch throws → ServiceUnavailableException
    it('throws ServiceUnavailableException when fetch throws a network error', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

      const service = makeService();

      await expect(
        service.geocodeAddress({
          streetAddress: 'Calle Mayor 1',
          postalCode: '28013',
          cityName: 'Madrid',
        }),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    // fetch returns non-ok response → ServiceUnavailableException
    it('throws ServiceUnavailableException when response is not ok', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      } as any);

      const service = makeService();

      await expect(
        service.geocodeAddress({
          streetAddress: 'Calle Mayor 1',
          postalCode: '28013',
          cityName: 'Madrid',
        }),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    // empty payload → null
    it('returns null when Nominatim returns empty results', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => [],
      } as any);

      const service = makeService();

      const result = await service.geocodeAddress({
        streetAddress: 'Calle Inexistente, 1',
        postalCode: '99999',
        cityName: 'Ciudad Ficticia',
      });

      expect(result).toBeNull();
    });

    // candidate has no lat/lon → null
    it('returns null when candidate is missing lat/lon', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => [{ display_name: 'Some place', address: {} }],
      } as any);

      const service = makeService();

      const result = await service.geocodeAddress({
        streetAddress: 'Calle Mayor 1',
        postalCode: '28013',
        cityName: 'Madrid',
      });

      expect(result).toBeNull();
    });

    // postal code mismatch → null
    it('returns null when postal codes do not match', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => [
          {
            lat: '40.4168',
            lon: '-3.7038',
            display_name: 'Madrid',
            address: { postcode: '28050' }, // different postal code
          },
        ],
      } as any);

      const service = makeService();

      const result = await service.geocodeAddress({
        streetAddress: 'Calle Mayor 1',
        postalCode: '28013',
        cityName: 'Madrid',
      });

      expect(result).toBeNull();
    });

    // uses display_name when present
    it('uses display_name from Nominatim response', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => [
          {
            lat: '40.4168',
            lon: '-3.7038',
            display_name: 'Gran Via 1, 28013 Madrid, España',
            address: { postcode: '28013' },
          },
        ],
      } as any);

      const service = makeService();

      const result = await service.geocodeAddress({
        streetAddress: 'Gran Via 1',
        postalCode: '28013',
        cityName: 'Madrid',
      });

      expect(result?.formattedAddress).toBe('Gran Via 1, 28013 Madrid, España');
    });

    // falls back to constructed address when display_name is missing
    it('constructs formattedAddress when display_name is missing', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => [
          {
            lat: '40.4168',
            lon: '-3.7038',
            address: { postcode: '28013' },
            // no display_name
          },
        ],
      } as any);

      const service = makeService();

      const result = await service.geocodeAddress({
        streetAddress: 'Calle X 1',
        postalCode: '28013',
        cityName: 'Madrid',
      });

      expect(result?.formattedAddress).toBe('Calle X 1, 28013, Madrid');
    });

    // uses custom GEOCODER_BASE_URL and GEOCODER_USER_AGENT
    it('uses configured GEOCODER_BASE_URL and GEOCODER_USER_AGENT', async () => {
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => [
          {
            lat: '40.0',
            lon: '-3.0',
            display_name: 'Custom',
            address: { postcode: '28013' },
          },
        ],
      } as any);

      const service = makeService({
        GEOCODER_BASE_URL: 'https://custom-geocoder.example.com/',
        GEOCODER_USER_AGENT: 'MyApp/2.0',
        GEOCODER_COUNTRY_CODE: 'es',
      });

      await service.geocodeAddress({
        streetAddress: 'Calle A 1',
        postalCode: '28013',
        cityName: 'Madrid',
      });

      const [calledUrl, options] = fetchMock.mock.calls[0] as any[];
      expect(calledUrl.toString()).toContain('custom-geocoder.example.com');
      expect(options.headers['User-Agent']).toBe('MyApp/2.0');
    });

    // no address field in candidate → postal match check skipped (no postcode)
    it('returns result when candidate has no postcode (postal check skipped)', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => [
          {
            lat: '40.4168',
            lon: '-3.7038',
            display_name: 'Some place',
            // no address field at all
          },
        ],
      } as any);

      const service = makeService();

      const result = await service.geocodeAddress({
        streetAddress: 'Calle Mayor 1',
        postalCode: '28013',
        cityName: 'Madrid',
      });

      // returnedPostal will be empty string (falsy) → postal check skipped → returns result
      expect(result).not.toBeNull();
    });
  });
});
