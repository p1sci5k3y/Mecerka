import { Role } from '@prisma/client';
import { RefundsController } from './refunds.controller';

describe('RefundsController', () => {
  let controller: RefundsController;
  let refundsServiceMock: {
    requestRefund: jest.Mock;
    getRefund: jest.Mock;
    listProviderOrderRefunds: jest.Mock;
    listDeliveryOrderRefunds: jest.Mock;
    reviewRefund: jest.Mock;
    approveRefund: jest.Mock;
    rejectRefund: jest.Mock;
    executeRefund: jest.Mock;
  };

  const req = {
    user: {
      userId: 'user-1',
      roles: [Role.ADMIN],
    },
  };

  beforeEach(() => {
    refundsServiceMock = {
      requestRefund: jest.fn().mockResolvedValue({ id: 'refund-1' }),
      getRefund: jest.fn().mockResolvedValue({ id: 'refund-1' }),
      listProviderOrderRefunds: jest.fn().mockResolvedValue([]),
      listDeliveryOrderRefunds: jest.fn().mockResolvedValue([]),
      reviewRefund: jest.fn().mockResolvedValue({ status: 'UNDER_REVIEW' }),
      approveRefund: jest.fn().mockResolvedValue({ status: 'APPROVED' }),
      rejectRefund: jest.fn().mockResolvedValue({ status: 'REJECTED' }),
      executeRefund: jest.fn().mockResolvedValue({ status: 'EXECUTED' }),
    };
    controller = new RefundsController(refundsServiceMock as never);
  });

  it('delegates refund request with authenticated actor context', async () => {
    const dto = { providerOrderId: 'po-1', reason: 'Damaged' };

    const result = await controller.requestRefund(dto as never, req as never);

    expect(refundsServiceMock.requestRefund).toHaveBeenCalledWith(
      dto,
      'user-1',
      [Role.ADMIN],
    );
    expect(result).toEqual({ id: 'refund-1' });
  });

  it('delegates refund reads and listing endpoints', async () => {
    await controller.getRefund(
      '9c1fc56f-d632-4cb0-b01e-e907c3e54eb4',
      req as never,
    );
    await controller.listProviderOrderRefunds(
      'fe8d1b1f-98d4-431c-9908-a9c2c31648ee',
      req as never,
    );
    await controller.listDeliveryOrderRefunds(
      '4981be7a-379f-48c2-b317-5b1918ed7dc7',
      req as never,
    );

    expect(refundsServiceMock.getRefund).toHaveBeenCalledWith(
      '9c1fc56f-d632-4cb0-b01e-e907c3e54eb4',
      'user-1',
      [Role.ADMIN],
    );
    expect(refundsServiceMock.listProviderOrderRefunds).toHaveBeenCalledWith(
      'fe8d1b1f-98d4-431c-9908-a9c2c31648ee',
      'user-1',
      [Role.ADMIN],
    );
    expect(refundsServiceMock.listDeliveryOrderRefunds).toHaveBeenCalledWith(
      '4981be7a-379f-48c2-b317-5b1918ed7dc7',
      'user-1',
      [Role.ADMIN],
    );
  });

  it('delegates admin review transitions', async () => {
    await controller.reviewRefund(
      '9c1fc56f-d632-4cb0-b01e-e907c3e54eb4',
      req as never,
    );
    await controller.approveRefund(
      '9c1fc56f-d632-4cb0-b01e-e907c3e54eb4',
      req as never,
    );
    await controller.rejectRefund(
      '9c1fc56f-d632-4cb0-b01e-e907c3e54eb4',
      req as never,
    );
    await controller.executeRefund(
      '9c1fc56f-d632-4cb0-b01e-e907c3e54eb4',
      req as never,
    );

    expect(refundsServiceMock.reviewRefund).toHaveBeenCalled();
    expect(refundsServiceMock.approveRefund).toHaveBeenCalled();
    expect(refundsServiceMock.rejectRefund).toHaveBeenCalled();
    expect(refundsServiceMock.executeRefund).toHaveBeenCalled();
  });
});
