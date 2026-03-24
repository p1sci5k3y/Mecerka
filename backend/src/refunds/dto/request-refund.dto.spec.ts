import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RequestRefundDto } from './request-refund.dto';

describe('RequestRefundDto', () => {
  it('normalizes amount and currency for valid refund requests', async () => {
    const dto = plainToInstance(RequestRefundDto, {
      providerOrderId: '4f99868d-6954-4980-8ad1-1cb42fd64080',
      type: 'PROVIDER_FULL',
      amount: '19.95',
      currency: ' eur ',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.amount).toBe(19.95);
    expect(dto.currency).toBe('EUR');
  });

  it('rejects malformed amounts and currencies', async () => {
    const dto = plainToInstance(RequestRefundDto, {
      type: 'INVALID_TYPE',
      amount: '0',
      currency: 'EURO',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'amount')).toBe(true);
    expect(errors.some((error) => error.property === 'currency')).toBe(true);
  });

  it('accepts numeric amounts without transformation and validates non-string currencies', async () => {
    const dto = plainToInstance(RequestRefundDto, {
      incidentId: '4f99868d-6954-4980-8ad1-1cb42fd64080',
      type: 'PROVIDER_FULL',
      amount: 19.95,
      currency: 123,
    });

    const errors = await validate(dto);

    expect(dto.amount).toBe(19.95);
    expect(dto.currency).toBe(123);
    expect(errors.every((error) => error.property !== 'amount')).toBe(true);
    expect(errors.some((error) => error.property === 'currency')).toBe(true);
  });
});
