export class Money {
  private constructor(
    private readonly _amount: number,
    private readonly _currency: string,
  ) {}

  static of(amount: number, currency = 'EUR'): Money {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error(`Invalid amount: ${amount}`);
    }
    if (!currency || currency.length !== 3) {
      throw new Error(`Invalid currency: ${currency}`);
    }
    return new Money(Math.round(amount * 100) / 100, currency.toUpperCase());
  }

  get amount(): number {
    return this._amount;
  }
  get currency(): string {
    return this._currency;
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this._amount + other._amount, this._currency);
  }

  multiply(factor: number): Money {
    return Money.of(this._amount * factor, this._currency);
  }

  equals(other: Money): boolean {
    return this._amount === other._amount && this._currency === other._currency;
  }

  toString(): string {
    return `${this._amount} ${this._currency}`;
  }

  private assertSameCurrency(other: Money): void {
    if (this._currency !== other._currency) {
      throw new Error(
        `Currency mismatch: ${this._currency} vs ${other._currency}`,
      );
    }
  }
}
