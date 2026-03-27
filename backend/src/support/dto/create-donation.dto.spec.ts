import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDonationDto } from './create-donation.dto';

describe('CreateDonationDto', () => {
  it('normalizes supported donations', async () => {
    const dto = plainToInstance(CreateDonationDto, {
      amount: '12.5',
      currency: 'eur',
      provider: 'NGO',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.amount).toBe(12.5);
    expect(dto.currency).toBe('EUR');
  });

  it('rejects unsupported amounts and currencies', async () => {
    const dto = plainToInstance(CreateDonationDto, {
      amount: '0.25',
      currency: 'usd',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'amount')).toBe(true);
    expect(errors.some((error) => error.property === 'currency')).toBe(true);
  });
});
