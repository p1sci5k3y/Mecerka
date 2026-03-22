import { Test, TestingModule } from '@nestjs/testing';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { OrdersService } from '../orders/orders.service';

describe('CartController', () => {
  let controller: CartController;
  let cartServiceMock: any;
  let ordersServiceMock: any;

  const fakeUser = { userId: 'client-1', roles: ['CLIENT'] as any };

  beforeEach(async () => {
    cartServiceMock = {
      getOrCreateActiveCartGroup: jest.fn().mockResolvedValue({ id: 'cart-1' }),
      addItem: jest.fn().mockResolvedValue({ id: 'item-1' }),
      updateItemQuantity: jest.fn().mockResolvedValue({ id: 'item-1' }),
      removeItem: jest.fn().mockResolvedValue({ id: 'item-1' }),
    };

    ordersServiceMock = {
      checkoutFromCart: jest.fn().mockResolvedValue({ orderId: 'order-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CartController],
      providers: [
        { provide: CartService, useValue: cartServiceMock },
        { provide: OrdersService, useValue: ordersServiceMock },
      ],
    }).compile();

    controller = module.get<CartController>(CartController);
  });

  afterEach(() => jest.clearAllMocks());

  it('getMyActiveCart delegates to cartService', async () => {
    const result = await controller.getMyActiveCart({ user: fakeUser } as any);
    expect(cartServiceMock.getOrCreateActiveCartGroup).toHaveBeenCalledWith(
      'client-1',
    );
    expect(result).toEqual({ id: 'cart-1' });
  });

  it('addItem delegates to cartService', async () => {
    const dto = { productId: 'prod-1', quantity: 2 } as any;
    const result = await controller.addItem({ user: fakeUser } as any, dto);
    expect(cartServiceMock.addItem).toHaveBeenCalledWith('client-1', dto);
    expect(result).toEqual({ id: 'item-1' });
  });

  it('updateItemQuantity delegates to cartService', async () => {
    const dto = { quantity: 5 } as any;
    const result = await controller.updateItemQuantity(
      { user: fakeUser } as any,
      'item-1',
      dto,
    );
    expect(cartServiceMock.updateItemQuantity).toHaveBeenCalledWith(
      'client-1',
      'item-1',
      dto,
    );
    expect(result).toEqual({ id: 'item-1' });
  });

  it('removeItem delegates to cartService', async () => {
    const result = await controller.removeItem(
      { user: fakeUser } as any,
      'item-1',
    );
    expect(cartServiceMock.removeItem).toHaveBeenCalledWith(
      'client-1',
      'item-1',
    );
    expect(result).toEqual({ id: 'item-1' });
  });

  describe('checkout', () => {
    it('delegates to ordersService with idempotency key when provided', async () => {
      const dto = { addressId: 'addr-1' } as any;
      const result = await controller.checkout(
        { user: fakeUser } as any,
        dto,
        'idem-key-123',
      );
      expect(ordersServiceMock.checkoutFromCart).toHaveBeenCalledWith(
        'client-1',
        dto,
        'idem-key-123',
      );
      expect(result).toEqual({ orderId: 'order-1' });
    });

    it('delegates to ordersService without idempotency key when omitted', async () => {
      const dto = { addressId: 'addr-2' } as any;
      const result = await controller.checkout(
        { user: fakeUser } as any,
        dto,
        undefined,
      );
      expect(ordersServiceMock.checkoutFromCart).toHaveBeenCalledWith(
        'client-1',
        dto,
        undefined,
      );
      expect(result).toEqual({ orderId: 'order-1' });
    });
  });
});
