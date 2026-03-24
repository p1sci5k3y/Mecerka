import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDeliveryOrderDto } from './create-delivery-order.dto';

describe('CreateDeliveryOrderDto', () => {
  it('normalizes valid delivery orders and uppercases the currency', async () => {
    const dto = plainToInstance(CreateDeliveryOrderDto, {
      orderId: '4f99868d-6954-4980-8ad1-1cb42fd64080',
      deliveryFee: '12.5',
      currency: null,
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.deliveryFee).toBe(12.5);
    expect(dto.currency).toBe('EUR');
  });

  it('rejects malformed ids, oversized fees, and unsupported currencies', async () => {
    const dto = plainToInstance(CreateDeliveryOrderDto, {
      orderId: 'not-a-uuid',
      deliveryFee: '500.999',
      currency: 'usd',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'orderId')).toBe(true);
    expect(errors.some((error) => error.property === 'deliveryFee')).toBe(true);
    expect(errors.some((error) => error.property === 'currency')).toBe(true);
  });
});
