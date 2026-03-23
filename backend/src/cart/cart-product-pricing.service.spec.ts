import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CartProductPricingService } from './cart-product-pricing.service';

describe('CartProductPricingService', () => {
  let service: CartProductPricingService;
  let prismaMock: {
    product: {
      findFirst: jest.Mock;
    };
  };

  beforeEach(async () => {
    prismaMock = {
      product: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartProductPricingService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<CartProductPricingService>(CartProductPricingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('throws when the product is not available for the cart', async () => {
    prismaMock.product.findFirst.mockResolvedValue(null);

    await expect(
      service.resolveActiveProductSnapshot('client-1', 'prod-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('uses the lowest valid discount between public and client-specific discounts', async () => {
    prismaMock.product.findFirst.mockResolvedValue({
      id: 'prod-1',
      providerId: 'provider-1',
      cityId: 'city-1',
      reference: 'REF-001',
      name: 'Chair',
      imageUrl: 'https://cdn.example.com/chair.jpg',
      price: 149,
      discountPrice: 139,
      clientDiscounts: [{ discountPrice: 129 }],
    });

    const result = await service.resolveActiveProductSnapshot(
      'client-1',
      'prod-1',
    );

    expect(result).toEqual(
      expect.objectContaining({
        discountPrice: 129,
        effectiveUnitPrice: 129,
      }),
    );
  });

  it('ignores invalid discount values and keeps the base price', async () => {
    prismaMock.product.findFirst.mockResolvedValue({
      id: 'prod-1',
      providerId: 'provider-1',
      cityId: 'city-1',
      reference: 'REF-001',
      name: 'Chair',
      imageUrl: null,
      price: 149,
      discountPrice: 149,
      clientDiscounts: [{ discountPrice: 170 }],
    });

    const result = await service.resolveActiveProductSnapshot(
      'client-1',
      'prod-1',
    );

    expect(result).toEqual(
      expect.objectContaining({
        discountPrice: null,
        effectiveUnitPrice: 149,
      }),
    );
  });

  it('returns snapshot data needed by cart mutations', async () => {
    prismaMock.product.findFirst.mockResolvedValue({
      id: 'prod-1',
      providerId: 'provider-1',
      cityId: 'city-1',
      reference: 'REF-001',
      name: 'Chair',
      imageUrl: 'https://cdn.example.com/chair.jpg',
      price: 149,
      discountPrice: null,
      clientDiscounts: [],
    });

    const result = await service.resolveActiveProductSnapshot(
      'client-1',
      'prod-1',
    );

    expect(result).toEqual({
      productId: 'prod-1',
      providerId: 'provider-1',
      cityId: 'city-1',
      reference: 'REF-001',
      name: 'Chair',
      imageUrl: 'https://cdn.example.com/chair.jpg',
      unitPrice: 149,
      discountPrice: null,
      effectiveUnitPrice: 149,
    });
  });
});
