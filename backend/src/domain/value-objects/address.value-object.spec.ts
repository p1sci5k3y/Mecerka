import { Address } from './address.value-object';

describe('Address', () => {
  const validProps = {
    street: 'Calle Mayor 1',
    city: 'Madrid',
    postalCode: '28001',
    country: 'España',
  };

  describe('Address.of()', () => {
    it('creates a valid Address with all required fields', () => {
      const address = Address.of(validProps);
      expect(address.street).toBe('Calle Mayor 1');
      expect(address.city).toBe('Madrid');
      expect(address.postalCode).toBe('28001');
      expect(address.country).toBe('España');
    });

    it('creates an Address without coordinates', () => {
      const address = Address.of(validProps);
      expect(address.coordinates).toBeUndefined();
    });

    it('creates an Address with coordinates', () => {
      const address = Address.of({
        ...validProps,
        coordinates: { lat: 40.416775, lng: -3.70379 },
      });
      expect(address.coordinates).toEqual({ lat: 40.416775, lng: -3.70379 });
    });

    it('throws when street is empty', () => {
      expect(() => Address.of({ ...validProps, street: '' })).toThrow(
        'Street is required',
      );
    });

    it('throws when street is only whitespace', () => {
      expect(() => Address.of({ ...validProps, street: '   ' })).toThrow(
        'Street is required',
      );
    });

    it('throws when city is empty', () => {
      expect(() => Address.of({ ...validProps, city: '' })).toThrow(
        'City is required',
      );
    });

    it('throws when city is only whitespace', () => {
      expect(() => Address.of({ ...validProps, city: '   ' })).toThrow(
        'City is required',
      );
    });

    it('throws when postalCode is empty', () => {
      expect(() => Address.of({ ...validProps, postalCode: '' })).toThrow(
        'Postal code is required',
      );
    });

    it('throws when postalCode is only whitespace', () => {
      expect(() => Address.of({ ...validProps, postalCode: '   ' })).toThrow(
        'Postal code is required',
      );
    });

    it('throws when country is empty', () => {
      expect(() => Address.of({ ...validProps, country: '' })).toThrow(
        'Country is required',
      );
    });

    it('throws when country is only whitespace', () => {
      expect(() => Address.of({ ...validProps, country: '   ' })).toThrow(
        'Country is required',
      );
    });

    it('trims street whitespace', () => {
      const address = Address.of({
        ...validProps,
        street: '  Calle Mayor 1  ',
      });
      expect(address.street).toBe('Calle Mayor 1');
    });

    it('trims city whitespace', () => {
      const address = Address.of({ ...validProps, city: '  Madrid  ' });
      expect(address.city).toBe('Madrid');
    });

    it('trims postalCode whitespace', () => {
      const address = Address.of({ ...validProps, postalCode: '  28001  ' });
      expect(address.postalCode).toBe('28001');
    });

    it('trims country whitespace', () => {
      const address = Address.of({ ...validProps, country: '  España  ' });
      expect(address.country).toBe('España');
    });
  });

  describe('withCoordinates()', () => {
    it('returns a new Address with the given coordinates', () => {
      const address = Address.of(validProps);
      const withCoords = address.withCoordinates(40.416775, -3.70379);
      expect(withCoords.coordinates).toEqual({ lat: 40.416775, lng: -3.70379 });
    });

    it('preserves original fields when adding coordinates', () => {
      const address = Address.of(validProps);
      const withCoords = address.withCoordinates(40.416775, -3.70379);
      expect(withCoords.street).toBe(address.street);
      expect(withCoords.city).toBe(address.city);
      expect(withCoords.postalCode).toBe(address.postalCode);
      expect(withCoords.country).toBe(address.country);
    });

    it('returns a new instance (immutability)', () => {
      const address = Address.of(validProps);
      const withCoords = address.withCoordinates(40.416775, -3.70379);
      expect(withCoords).not.toBe(address);
    });

    it('does not mutate the original instance', () => {
      const address = Address.of(validProps);
      address.withCoordinates(40.416775, -3.70379);
      expect(address.coordinates).toBeUndefined();
    });
  });

  describe('equals()', () => {
    it('returns true for addresses with same fields', () => {
      const a = Address.of(validProps);
      const b = Address.of(validProps);
      expect(a.equals(b)).toBe(true);
    });

    it('returns false when streets differ', () => {
      const a = Address.of(validProps);
      const b = Address.of({ ...validProps, street: 'Gran Via 2' });
      expect(a.equals(b)).toBe(false);
    });

    it('returns false when cities differ', () => {
      const a = Address.of(validProps);
      const b = Address.of({ ...validProps, city: 'Barcelona' });
      expect(a.equals(b)).toBe(false);
    });

    it('returns false when postalCodes differ', () => {
      const a = Address.of(validProps);
      const b = Address.of({ ...validProps, postalCode: '08001' });
      expect(a.equals(b)).toBe(false);
    });

    it('returns false when countries differ', () => {
      const a = Address.of(validProps);
      const b = Address.of({ ...validProps, country: 'Portugal' });
      expect(a.equals(b)).toBe(false);
    });

    it('considers equal two addresses with different coordinates', () => {
      const a = Address.of(validProps).withCoordinates(40.0, -3.0);
      const b = Address.of(validProps).withCoordinates(41.0, -4.0);
      expect(a.equals(b)).toBe(true);
    });
  });

  describe('toString()', () => {
    it('returns a formatted address string', () => {
      const address = Address.of(validProps);
      expect(address.toString()).toBe('Calle Mayor 1, 28001 Madrid, España');
    });
  });
});
