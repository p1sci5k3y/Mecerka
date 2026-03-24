import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CheckoutCartDto } from './checkout-cart.dto';

describe('CheckoutCartDto', () => {
  it('normalizes valid checkout payloads', async () => {
    const dto = plainToInstance(CheckoutCartDto, {
      cityId: '4f99868d-6954-4980-8ad1-1cb42fd64080',
      deliveryAddress: '  Calle Mayor 1  ',
      postalCode: ' 28013 ',
      addressReference: '  portal azul ',
      discoveryRadiusKm: '12.5',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.deliveryAddress).toBe('Calle Mayor 1');
    expect(dto.postalCode).toBe('28013');
    expect(dto.addressReference).toBe('portal azul');
    expect(dto.discoveryRadiusKm).toBe(12.5);
  });

  it('rejects invalid postal codes and discovery radius values', async () => {
    const dto = plainToInstance(CheckoutCartDto, {
      cityId: '4f99868d-6954-4980-8ad1-1cb42fd64080',
      deliveryAddress: 'Calle Mayor 1',
      postalCode: '??',
      discoveryRadiusKm: '0.1',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'postalCode')).toBe(true);
    expect(errors.some((error) => error.property === 'discoveryRadiusKm')).toBe(
      true,
    );
  });

  it('normalizes blank address references to undefined', async () => {
    const dto = plainToInstance(CheckoutCartDto, {
      cityId: '4f99868d-6954-4980-8ad1-1cb42fd64080',
      deliveryAddress: 'Calle Mayor 1',
      postalCode: '28013',
      addressReference: '   ',
      discoveryRadiusKm: 5,
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.addressReference).toBeUndefined();
  });

  it('coerces nullish string fields before validation', async () => {
    const dto = plainToInstance(CheckoutCartDto, {
      cityId: '4f99868d-6954-4980-8ad1-1cb42fd64080',
      deliveryAddress: null,
      postalCode: undefined,
      addressReference: null,
      discoveryRadiusKm: 5,
    });

    const errors = await validate(dto);

    expect(dto.deliveryAddress).toBe('');
    expect(dto.postalCode).toBe('');
    expect(dto.addressReference).toBeUndefined();
    expect(errors.some((error) => error.property === 'deliveryAddress')).toBe(
      true,
    );
    expect(errors.some((error) => error.property === 'postalCode')).toBe(true);
  });
});
