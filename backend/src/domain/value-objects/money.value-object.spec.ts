import { Money } from './money.value-object';

describe('Money', () => {
  describe('Money.of()', () => {
    it('creates a valid Money instance with amount and currency', () => {
      const money = Money.of(10, 'EUR');
      expect(money.amount).toBe(10);
      expect(money.currency).toBe('EUR');
    });

    it('uses EUR as default currency when none is provided', () => {
      const money = Money.of(5);
      expect(money.currency).toBe('EUR');
    });

    it('creates Money with zero amount', () => {
      const money = Money.of(0, 'USD');
      expect(money.amount).toBe(0);
    });

    it('throws when amount is negative', () => {
      expect(() => Money.of(-1, 'EUR')).toThrow('Invalid amount: -1');
    });

    it('throws when amount is NaN', () => {
      expect(() => Money.of(NaN, 'EUR')).toThrow('Invalid amount: NaN');
    });

    it('throws when amount is Infinity', () => {
      expect(() => Money.of(Infinity, 'EUR')).toThrow(
        'Invalid amount: Infinity',
      );
    });

    it('throws when amount is -Infinity', () => {
      expect(() => Money.of(-Infinity, 'EUR')).toThrow();
    });

    it('throws when currency is empty string', () => {
      expect(() => Money.of(10, '')).toThrow('Invalid currency: ');
    });

    it('throws when currency has length different from 3 (too short)', () => {
      expect(() => Money.of(10, 'EU')).toThrow('Invalid currency: EU');
    });

    it('throws when currency has length different from 3 (too long)', () => {
      expect(() => Money.of(10, 'EURO')).toThrow('Invalid currency: EURO');
    });

    it('rounds amount to 2 decimal places', () => {
      const money = Money.of(10.555, 'EUR');
      expect(money.amount).toBe(10.56);
    });

    it('rounds amount down when third decimal is less than 5', () => {
      const money = Money.of(10.554, 'EUR');
      expect(money.amount).toBe(10.55);
    });

    it('normalizes currency to uppercase', () => {
      const money = Money.of(10, 'eur');
      expect(money.currency).toBe('EUR');
    });

    it('normalizes mixed-case currency to uppercase', () => {
      const money = Money.of(10, 'uSd');
      expect(money.currency).toBe('USD');
    });
  });

  describe('add()', () => {
    it('adds two Money instances of the same currency', () => {
      const a = Money.of(10, 'EUR');
      const b = Money.of(5, 'EUR');
      expect(a.add(b).amount).toBe(15);
      expect(a.add(b).currency).toBe('EUR');
    });

    it('returns a new Money instance (immutability)', () => {
      const a = Money.of(10, 'EUR');
      const b = Money.of(5, 'EUR');
      const result = a.add(b);
      expect(result).not.toBe(a);
      expect(result).not.toBe(b);
    });

    it('throws when adding Money with different currencies', () => {
      const eur = Money.of(10, 'EUR');
      const usd = Money.of(10, 'USD');
      expect(() => eur.add(usd)).toThrow('Currency mismatch: EUR vs USD');
    });

    it('correctly handles adding zero', () => {
      const a = Money.of(10, 'EUR');
      const zero = Money.of(0, 'EUR');
      expect(a.add(zero).amount).toBe(10);
    });
  });

  describe('multiply()', () => {
    it('multiplies amount by a factor', () => {
      const money = Money.of(10, 'EUR');
      expect(money.multiply(3).amount).toBe(30);
    });

    it('returns a new Money instance (immutability)', () => {
      const money = Money.of(10, 'EUR');
      const result = money.multiply(2);
      expect(result).not.toBe(money);
    });

    it('multiplies by a fractional factor and rounds to 2 decimals', () => {
      const money = Money.of(10, 'EUR');
      expect(money.multiply(0.333).amount).toBe(3.33);
    });

    it('multiplies by zero to get zero', () => {
      const money = Money.of(10, 'EUR');
      expect(money.multiply(0).amount).toBe(0);
    });
  });

  describe('equals()', () => {
    it('returns true for Money instances with same amount and currency', () => {
      const a = Money.of(10, 'EUR');
      const b = Money.of(10, 'EUR');
      expect(a.equals(b)).toBe(true);
    });

    it('returns false when amounts differ', () => {
      const a = Money.of(10, 'EUR');
      const b = Money.of(20, 'EUR');
      expect(a.equals(b)).toBe(false);
    });

    it('returns false when currencies differ', () => {
      const a = Money.of(10, 'EUR');
      const b = Money.of(10, 'USD');
      expect(a.equals(b)).toBe(false);
    });

    it('returns false when both amount and currency differ', () => {
      const a = Money.of(10, 'EUR');
      const b = Money.of(20, 'USD');
      expect(a.equals(b)).toBe(false);
    });
  });

  describe('toString()', () => {
    it('returns amount and currency separated by space', () => {
      const money = Money.of(10.5, 'EUR');
      expect(money.toString()).toBe('10.5 EUR');
    });

    it('returns integer amount without trailing decimals', () => {
      const money = Money.of(10, 'USD');
      expect(money.toString()).toBe('10 USD');
    });
  });
});
