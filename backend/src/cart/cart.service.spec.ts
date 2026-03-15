import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CartService } from './cart.service';

describe('CartService', () => {
  let service: CartService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      cartGroup: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      cartProvider: {
        upsert: jest.fn(),
        update: jest.fn(),
      },
      cartItem: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
      },
      product: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<CartService>(CartService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns the existing active cart group for the client', async () => {
    prismaMock.cartGroup.findFirst.mockResolvedValue({
      id: 'cart-1',
      clientId: 'client-1',
      status: 'ACTIVE',
      city: null,
      providers: [],
    });

    const result = await service.getOrCreateActiveCartGroup('client-1');

    expect(prismaMock.cartGroup.create).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        id: 'cart-1',
        clientId: 'client-1',
        status: 'ACTIVE',
      }),
    );
  });

  it('creates a new active cart group when the client has none', async () => {
    prismaMock.cartGroup.findFirst.mockResolvedValue(null);
    prismaMock.cartGroup.create.mockResolvedValue({
      id: 'cart-2',
      clientId: 'client-2',
      status: 'ACTIVE',
      city: null,
      providers: [],
    });

    const result = await service.getOrCreateActiveCartGroup('client-2');

    expect(prismaMock.cartGroup.create).toHaveBeenCalledWith({
      data: {
        clientId: 'client-2',
        status: 'ACTIVE',
      },
      include: {
        city: true,
        providers: {
          orderBy: {
            createdAt: 'asc',
          },
          include: {
            provider: {
              select: {
                id: true,
                name: true,
              },
            },
            items: {
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        },
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 'cart-2',
        clientId: 'client-2',
        status: 'ACTIVE',
      }),
    );
  });

  it('creates or reuses a provider partition inside the cart group', async () => {
    prismaMock.cartProvider.upsert.mockResolvedValue({
      id: 'cart-provider-1',
      cartGroupId: 'cart-1',
      providerId: 'provider-1',
      subtotalAmount: 0,
      itemCount: 0,
      provider: {
        id: 'provider-1',
        name: 'Provider One',
      },
    });

    const result = await service.ensureCartProvider('cart-1', 'provider-1');

    expect(prismaMock.cartProvider.upsert).toHaveBeenCalledWith({
      where: {
        cartGroupId_providerId: {
          cartGroupId: 'cart-1',
          providerId: 'provider-1',
        },
      },
      update: {},
      create: {
        cartGroupId: 'cart-1',
        providerId: 'provider-1',
      },
      include: {
        provider: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 'cart-provider-1',
        cartGroupId: 'cart-1',
        providerId: 'provider-1',
      }),
    );
  });

  it('adds a new cart item using only server-side product snapshots', async () => {
    prismaMock.product.findFirst.mockResolvedValue({
      id: 'product-1',
      providerId: 'provider-1',
      cityId: 'city-1',
      reference: 'CHAIR-001',
      name: 'Oak Chair',
      imageUrl: 'https://cdn.example.com/chair.jpg',
      price: 149,
      discountPrice: 129,
    });
    prismaMock.cartGroup.findFirst.mockResolvedValue({
      id: 'cart-1',
      clientId: 'client-1',
      cityId: null,
      status: 'ACTIVE',
      city: null,
      providers: [],
    });
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        cartGroup: {
          update: jest
            .fn()
            .mockResolvedValue({ id: 'cart-1', cityId: 'city-1' }),
        },
        cartProvider: {
          upsert: jest.fn().mockResolvedValue({ id: 'cart-provider-1' }),
          update: jest.fn().mockResolvedValue({}),
        },
        cartItem: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({}),
          update: jest.fn(),
          findMany: jest
            .fn()
            .mockResolvedValue([
              { quantity: 2, effectiveUnitPriceSnapshot: 129 },
            ]),
        },
      }),
    );
    prismaMock.cartGroup.findUniqueOrThrow.mockResolvedValue({
      id: 'cart-1',
      cityId: 'city-1',
      providers: [],
    });

    await service.addItem('client-1', {
      productId: 'product-1',
      quantity: 2,
    });

    expect(prismaMock.product.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'product-1',
        isActive: true,
        provider: {
          active: true,
          stripeAccountId: {
            not: null,
          },
        },
      },
      select: {
        id: true,
        providerId: true,
        cityId: true,
        reference: true,
        name: true,
        imageUrl: true,
        price: true,
        discountPrice: true,
      },
    });
  });

  it('refreshes snapshots and quantity when the same product is added again', async () => {
    prismaMock.product.findFirst.mockResolvedValue({
      id: 'product-1',
      providerId: 'provider-1',
      cityId: 'city-1',
      reference: 'CHAIR-001',
      name: 'Oak Chair Updated',
      imageUrl: 'https://cdn.example.com/chair-new.jpg',
      price: 159,
      discountPrice: 139,
    });
    prismaMock.cartGroup.findFirst.mockResolvedValue({
      id: 'cart-1',
      clientId: 'client-1',
      cityId: 'city-1',
      status: 'ACTIVE',
      city: { id: 'city-1' },
      providers: [],
    });

    const transactionCartItemUpdate = jest.fn().mockResolvedValue({});
    const transactionCartProviderUpdate = jest.fn().mockResolvedValue({});

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        cartGroup: {
          update: jest.fn(),
        },
        cartProvider: {
          upsert: jest.fn().mockResolvedValue({ id: 'cart-provider-1' }),
          update: transactionCartProviderUpdate,
        },
        cartItem: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'cart-item-1',
            quantity: 1,
          }),
          create: jest.fn(),
          update: transactionCartItemUpdate,
          findMany: jest
            .fn()
            .mockResolvedValue([
              { quantity: 4, effectiveUnitPriceSnapshot: 139 },
            ]),
        },
      }),
    );
    prismaMock.cartGroup.findUniqueOrThrow.mockResolvedValue({
      id: 'cart-1',
      cityId: 'city-1',
      providers: [],
    });

    await service.addItem('client-1', {
      productId: 'product-1',
      quantity: 3,
    });

    expect(transactionCartItemUpdate).toHaveBeenCalledWith({
      where: { id: 'cart-item-1' },
      data: {
        quantity: 4,
        productReferenceSnapshot: 'CHAIR-001',
        productNameSnapshot: 'Oak Chair Updated',
        imageUrlSnapshot: 'https://cdn.example.com/chair-new.jpg',
        unitPriceSnapshot: 159,
        discountPriceSnapshot: 139,
        effectiveUnitPriceSnapshot: 139,
      },
    });
    expect(transactionCartProviderUpdate).toHaveBeenCalledWith({
      where: {
        id: 'cart-provider-1',
      },
      data: {
        itemCount: 4,
        subtotalAmount: 556,
      },
    });
  });

  it('updates item quantity and refreshes snapshots from the current product state', async () => {
    prismaMock.cartItem.findFirst.mockResolvedValue({
      id: 'cart-item-1',
      productId: 'product-1',
      cartProviderId: 'cart-provider-1',
      cartProvider: {
        cartGroupId: 'cart-1',
      },
    });
    prismaMock.product.findFirst.mockResolvedValue({
      reference: 'CHAIR-001',
      name: 'Oak Chair Repriced',
      imageUrl: 'https://cdn.example.com/chair-repriced.jpg',
      price: 160,
      discountPrice: 140,
    });

    const transactionCartItemUpdate = jest.fn().mockResolvedValue({});
    const transactionCartProviderUpdate = jest.fn().mockResolvedValue({});

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        cartItem: {
          update: transactionCartItemUpdate,
          findMany: jest.fn().mockResolvedValue([
            {
              quantity: 5,
              effectiveUnitPriceSnapshot: 140,
            },
          ]),
        },
        cartProvider: {
          update: transactionCartProviderUpdate,
        },
      }),
    );
    prismaMock.cartGroup.findUniqueOrThrow.mockResolvedValue({
      id: 'cart-1',
      providers: [],
    });

    await service.updateItemQuantity('client-1', 'cart-item-1', {
      quantity: 5,
    });

    expect(transactionCartItemUpdate).toHaveBeenCalledWith({
      where: { id: 'cart-item-1' },
      data: {
        quantity: 5,
        productReferenceSnapshot: 'CHAIR-001',
        productNameSnapshot: 'Oak Chair Repriced',
        imageUrlSnapshot: 'https://cdn.example.com/chair-repriced.jpg',
        unitPriceSnapshot: 160,
        discountPriceSnapshot: 140,
        effectiveUnitPriceSnapshot: 140,
      },
    });
    expect(transactionCartProviderUpdate).toHaveBeenCalledWith({
      where: { id: 'cart-provider-1' },
      data: { itemCount: 5, subtotalAmount: 700 },
    });
  });

  it('removes an item and recalculates provider totals', async () => {
    prismaMock.cartItem.findFirst.mockResolvedValue({
      id: 'cart-item-1',
      cartProviderId: 'cart-provider-1',
      cartProvider: {
        cartGroupId: 'cart-1',
      },
    });

    const transactionCartItemDelete = jest.fn().mockResolvedValue({});
    const transactionCartProviderUpdate = jest.fn().mockResolvedValue({});
    const transactionCartProviderDelete = jest.fn();

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        cartItem: {
          delete: transactionCartItemDelete,
          findMany: jest.fn().mockResolvedValue([
            {
              quantity: 2,
              effectiveUnitPriceSnapshot: 139,
            },
          ]),
        },
        cartProvider: {
          update: transactionCartProviderUpdate,
          delete: transactionCartProviderDelete,
        },
      }),
    );
    prismaMock.cartGroup.findUniqueOrThrow.mockResolvedValue({
      id: 'cart-1',
      providers: [],
    });

    await service.removeItem('client-1', 'cart-item-1');

    expect(transactionCartItemDelete).toHaveBeenCalledWith({
      where: { id: 'cart-item-1' },
    });
    expect(transactionCartProviderUpdate).toHaveBeenCalledWith({
      where: { id: 'cart-provider-1' },
      data: { itemCount: 2, subtotalAmount: 278 },
    });
    expect(transactionCartProviderDelete).not.toHaveBeenCalled();
  });

  it('deletes the provider partition when its last item is removed', async () => {
    prismaMock.cartItem.findFirst.mockResolvedValue({
      id: 'cart-item-1',
      cartProviderId: 'cart-provider-1',
      cartProvider: {
        cartGroupId: 'cart-1',
      },
    });

    const transactionCartProviderDelete = jest.fn().mockResolvedValue({});

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        cartItem: {
          delete: jest.fn().mockResolvedValue({}),
          findMany: jest.fn().mockResolvedValue([]),
        },
        cartProvider: {
          update: jest.fn().mockResolvedValue({}),
          delete: transactionCartProviderDelete,
        },
      }),
    );
    prismaMock.cartGroup.findUniqueOrThrow.mockResolvedValue({
      id: 'cart-1',
      providers: [],
    });

    await service.removeItem('client-1', 'cart-item-1');

    expect(transactionCartProviderDelete).toHaveBeenCalledWith({
      where: { id: 'cart-provider-1' },
    });
  });
});
