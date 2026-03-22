import {
  isValidSpanishFiscalId,
  normalizeSpanishFiscalId,
  IsSpanishFiscalIdConstraint,
} from './is-spanish-fiscal-id.validator';

describe('isValidSpanishFiscalId', () => {
  describe('NIF validation', () => {
    it('accepts valid NIF (letter check)', () => {
      // 0 % 23 = 0 → 'T'
      expect(isValidSpanishFiscalId('00000000T')).toBe(true);
    });

    it('rejects NIF with wrong letter', () => {
      expect(isValidSpanishFiscalId('00000000A')).toBe(false);
    });

    it('rejects NIF with wrong format (too short)', () => {
      expect(isValidSpanishFiscalId('1234567T')).toBe(false);
    });

    it('rejects NIF with non-digit prefix', () => {
      expect(isValidSpanishFiscalId('1234567AT')).toBe(false);
    });

    it('accepts valid NIF with spaces stripped', () => {
      expect(isValidSpanishFiscalId('0000 0000T')).toBe(true);
    });
  });

  describe('NIE validation', () => {
    it('accepts valid NIE starting with X (prefix 0)', () => {
      // X0000000 → normalized = '00000000' → 0 % 23 = 0 → 'T'
      expect(isValidSpanishFiscalId('X0000000T')).toBe(true);
    });

    it('accepts valid NIE starting with Y (prefix 1)', () => {
      // Y0000000 → normalized = '10000000' → 10000000 % 23 = 14 → NIF_LETTERS[14] = 'Z'
      expect(isValidSpanishFiscalId('Y0000000Z')).toBe(true);
    });

    it('accepts valid NIE starting with Z (prefix 2)', () => {
      // Z0000000 → normalized = '20000000' → 20000000 % 23
      // 20000000 / 23 = 869565.2... → 869565 * 23 = 19999995 → remainder = 5 → 'M'
      expect(isValidSpanishFiscalId('Z0000000M')).toBe(true);
    });

    it('rejects NIE with wrong letter', () => {
      expect(isValidSpanishFiscalId('X0000000A')).toBe(false);
    });

    it('rejects NIE with wrong format', () => {
      expect(isValidSpanishFiscalId('X123456T')).toBe(false);
    });
  });

  describe('CIF validation', () => {
    // A0000001: digits="0000001", oddSum=2 (index 6: 1*2=2), evenSum=0, total=2,
    // controlDigit=(10-2)%10=8, expectedDigit='8', expectedLetter='I'
    // 'A' is in 'ABEH' → must match digit
    it('accepts valid CIF with digit control (A type)', () => {
      expect(isValidSpanishFiscalId('A00000018')).toBe(true);
    });

    it('rejects CIF with letter control when digit expected (A type)', () => {
      expect(isValidSpanishFiscalId('A0000001I')).toBe(false);
    });

    // N is in 'PQRSNW' → must match letter
    // A0000001: controlDigit=8, CIF_CONTROL_LETTERS[8]='H'
    it('accepts valid CIF with letter control (N type)', () => {
      expect(isValidSpanishFiscalId('N0000001H')).toBe(true);
    });

    it('rejects CIF with digit control when letter expected (N type)', () => {
      expect(isValidSpanishFiscalId('N00000018')).toBe(false);
    });

    // C is not in 'PQRSNW' or 'ABEH' → either digit or letter accepted
    it('accepts valid CIF with digit control (C type)', () => {
      expect(isValidSpanishFiscalId('C00000018')).toBe(true);
    });

    it('accepts valid CIF with letter control (C type)', () => {
      expect(isValidSpanishFiscalId('C0000001H')).toBe(true);
    });

    it('rejects CIF with wrong format', () => {
      expect(isValidSpanishFiscalId('A123456')).toBe(false);
    });

    it('rejects CIF with invalid control char', () => {
      expect(isValidSpanishFiscalId('A0000001Z')).toBe(false);
    });
  });

  describe('country parameter', () => {
    it('returns false when country is not a string but not undefined', () => {
      expect(isValidSpanishFiscalId('00000000T', 123 as any)).toBe(false);
    });

    it('returns false when country is a non-ES string', () => {
      expect(isValidSpanishFiscalId('00000000T', 'FR')).toBe(false);
    });

    it('accepts when country is ES (case insensitive)', () => {
      expect(isValidSpanishFiscalId('00000000T', 'es')).toBe(true);
    });

    it('accepts when country is undefined', () => {
      expect(isValidSpanishFiscalId('00000000T', undefined)).toBe(true);
    });
  });

  it('returns false for completely invalid string', () => {
    expect(isValidSpanishFiscalId('INVALID')).toBe(false);
  });
});

describe('normalizeSpanishFiscalId', () => {
  it('removes spaces and dashes and uppercases', () => {
    expect(normalizeSpanishFiscalId('0000 0000-t')).toBe('00000000T');
  });
});

describe('IsSpanishFiscalIdConstraint', () => {
  let constraint: IsSpanishFiscalIdConstraint;

  beforeEach(() => {
    constraint = new IsSpanishFiscalIdConstraint();
  });

  describe('validate', () => {
    it('returns false when value is not a string', () => {
      const args = { object: { country: 'ES' } } as any;
      expect(constraint.validate(12345678, args)).toBe(false);
    });

    it('returns true for valid NIF with ES country', () => {
      const args = { object: { country: 'ES' } } as any;
      expect(constraint.validate('00000000T', args)).toBe(true);
    });

    it('returns false for invalid NIF', () => {
      const args = { object: { country: 'ES' } } as any;
      expect(constraint.validate('00000000A', args)).toBe(false);
    });

    it('returns false for non-ES country', () => {
      const args = { object: { country: 'FR' } } as any;
      expect(constraint.validate('00000000T', args)).toBe(false);
    });
  });

  describe('defaultMessage', () => {
    it('returns country code error when country is not a string', () => {
      const args = { object: { country: 123 } } as any;
      expect(constraint.defaultMessage(args)).toBe(
        'country must be a two-letter ISO country code',
      );
    });

    it('returns ES-only support error when country is non-ES string', () => {
      const args = { object: { country: 'FR' } } as any;
      expect(constraint.defaultMessage(args)).toBe(
        'Only ES fiscal IDs are currently supported',
      );
    });

    it('returns fiscal ID format error when country is ES', () => {
      const args = { object: { country: 'ES' } } as any;
      expect(constraint.defaultMessage(args)).toBe(
        'fiscalId must be a valid NIF, NIE, or CIF',
      );
    });

    it('returns fiscal ID format error when country is empty string', () => {
      const args = { object: { country: '' } } as any;
      expect(constraint.defaultMessage(args)).toBe(
        'fiscalId must be a valid NIF, NIE, or CIF',
      );
    });
  });
});
