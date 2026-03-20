export type GeocodeAddressInput = {
  streetAddress: string;
  postalCode: string;
  cityName: string;
};

export type GeocodedAddress = {
  latitude: number;
  longitude: number;
  formattedAddress: string;
};

export interface GeocodingPort {
  geocodeAddress(input: GeocodeAddressInput): Promise<GeocodedAddress | null>;
}
