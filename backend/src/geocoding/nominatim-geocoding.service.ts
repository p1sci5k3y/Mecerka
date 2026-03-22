import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GeocodedAddress,
  GeocodeAddressInput,
  GeocodingPort,
} from './geocoding.types';

@Injectable()
export class NominatimGeocodingService implements GeocodingPort {
  private readonly logger = new Logger(NominatimGeocodingService.name);
  private static readonly DEMO_ADDRESS_FIXTURES = new Map<
    string,
    GeocodedAddress
  >([
    [
      'calle hombre de palo, 7|45001|toledo',
      {
        latitude: 39.8567,
        longitude: -4.0241,
        formattedAddress: 'Calle Hombre de Palo, 7, 45001 Toledo, Spain',
      },
    ],
    [
      'calle sixto ramon parro, 9|45001|toledo',
      {
        latitude: 39.8573,
        longitude: -4.0254,
        formattedAddress: 'Calle Sixto Ramon Parro, 9, 45001 Toledo, Spain',
      },
    ],
    [
      'cuesta carlos v, 3|45001|toledo',
      {
        latitude: 39.8579,
        longitude: -4.0229,
        formattedAddress: 'Cuesta Carlos V, 3, 45001 Toledo, Spain',
      },
    ],
  ]);

  constructor(private readonly configService: ConfigService) {}

  private normalizePostalCode(value: string) {
    return value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  }

  private normalizeAddressFragment(value: string) {
    return value
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  private getDemoFixture(input: GeocodeAddressInput): GeocodedAddress | null {
    if (this.configService.get<string>('DEMO_MODE') !== 'true') {
      return null;
    }

    const key = [
      this.normalizeAddressFragment(input.streetAddress),
      this.normalizePostalCode(input.postalCode),
      this.normalizeAddressFragment(input.cityName),
    ].join('|');

    return NominatimGeocodingService.DEMO_ADDRESS_FIXTURES.get(key) ?? null;
  }

  private buildSearchUrl(input: GeocodeAddressInput) {
    const baseUrl =
      this.configService.get<string>('GEOCODER_BASE_URL')?.trim() ??
      'https://nominatim.openstreetmap.org';
    const countryCode =
      this.configService.get<string>('GEOCODER_COUNTRY_CODE')?.trim() ?? 'es';
    const url = new URL('/search', `${baseUrl.replace(/\/$/, '')}/`);

    url.searchParams.set(
      'q',
      [input.streetAddress, input.postalCode, input.cityName, 'Spain'].join(
        ', ',
      ),
    );
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('countrycodes', countryCode.toLowerCase());

    return url;
  }

  async geocodeAddress(
    input: GeocodeAddressInput,
  ): Promise<GeocodedAddress | null> {
    const demoFixture = this.getDemoFixture(input);
    if (demoFixture) {
      this.logger.log(
        `geocoding.demo_fixture city=${input.cityName} postalCode=${input.postalCode}`,
      );
      return demoFixture;
    }

    const userAgent =
      this.configService.get<string>('GEOCODER_USER_AGENT')?.trim() ??
      'Mecerka/1.0 (local-checkout-geocoder)';
    const url = this.buildSearchUrl(input);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          'Accept-Language': 'es,en',
          'User-Agent': userAgent,
        },
        signal: AbortSignal.timeout(5000),
      });
    } catch (error: unknown) {
      this.logger.warn(
        `geocoding.request_failed message=${(error as Error).message ?? 'unknown'}`,
      );
      throw new ServiceUnavailableException('Geocoding service unavailable');
    }

    if (!response.ok) {
      this.logger.warn(
        `geocoding.unavailable status=${response.status} statusText=${response.statusText}`,
      );
      throw new ServiceUnavailableException('Geocoding service unavailable');
    }

    const payload = (await response.json()) as Array<{
      lat?: string;
      lon?: string;
      display_name?: string;
      address?: {
        postcode?: string;
      };
    }>;

    const candidate = payload[0];
    if (!candidate?.lat || !candidate?.lon) {
      return null;
    }

    const latitude = Number(candidate.lat);
    const longitude = Number(candidate.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    const requestedPostal = this.normalizePostalCode(input.postalCode);
    const returnedPostal = this.normalizePostalCode(
      candidate.address?.postcode ?? '',
    );

    if (
      returnedPostal &&
      requestedPostal &&
      !returnedPostal.includes(requestedPostal) &&
      !requestedPostal.includes(returnedPostal)
    ) {
      return null;
    }

    return {
      latitude,
      longitude,
      formattedAddress:
        candidate.display_name ??
        `${input.streetAddress}, ${input.postalCode}, ${input.cityName}`,
    };
  }
}
