import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductDto } from './create-product.dto';

describe('CreateProductDto', () => {
  it('accepts valid product payloads and coerces numeric fields', async () => {
    const dto = plainToInstance(CreateProductDto, {
      reference: 'prod-001',
      name: 'Demo Product',
      description: 'Example description',
      price: '12.5',
      discountPrice: '10.5',
      stock: '7',
      imageUrl: 'https://example.com/product.jpg',
      cityId: '4f99868d-6954-4980-8ad1-1cb42fd64080',
      categoryId: '9c1fc56f-d632-4cb0-b01e-e907c3e54eb4',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.price).toBe(12.5);
    expect(dto.discountPrice).toBe(10.5);
    expect(dto.stock).toBe(7);
  });

  it('rejects invalid references and negative stock', async () => {
    const dto = plainToInstance(CreateProductDto, {
      reference: 'bad reference',
      name: 'Demo Product',
      price: 12.5,
      stock: -1,
      cityId: '4f99868d-6954-4980-8ad1-1cb42fd64080',
      categoryId: '9c1fc56f-d632-4cb0-b01e-e907c3e54eb4',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'reference')).toBe(true);
    expect(errors.some((error) => error.property === 'stock')).toBe(true);
  });
});
