export class Address {
  private constructor(
    readonly street: string,
    readonly city: string,
    readonly postalCode: string,
    readonly country: string,
    readonly coordinates?: { lat: number; lng: number },
  ) {}

  static of(props: {
    street: string;
    city: string;
    postalCode: string;
    country: string;
    coordinates?: { lat: number; lng: number };
  }): Address {
    if (!props.street?.trim()) throw new Error('Street is required');
    if (!props.city?.trim()) throw new Error('City is required');
    if (!props.postalCode?.trim()) throw new Error('Postal code is required');
    if (!props.country?.trim()) throw new Error('Country is required');
    return new Address(
      props.street.trim(),
      props.city.trim(),
      props.postalCode.trim(),
      props.country.trim(),
      props.coordinates,
    );
  }

  withCoordinates(lat: number, lng: number): Address {
    return new Address(this.street, this.city, this.postalCode, this.country, {
      lat,
      lng,
    });
  }

  equals(other: Address): boolean {
    return (
      this.street === other.street &&
      this.city === other.city &&
      this.postalCode === other.postalCode &&
      this.country === other.country
    );
  }

  toString(): string {
    return `${this.street}, ${this.postalCode} ${this.city}, ${this.country}`;
  }
}
