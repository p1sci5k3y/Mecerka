import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConfirmDeliveryDto } from './confirm-delivery.dto';

describe('ConfirmDeliveryDto', () => {
  it('trims optional delivery confirmation fields', async () => {
    const dto = plainToInstance(ConfirmDeliveryDto, {
      deliveryProofUrl: ' https://example.com/proof.jpg ',
      deliveryNotes: '  delivered to concierge  ',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.deliveryProofUrl).toBe('https://example.com/proof.jpg');
    expect(dto.deliveryNotes).toBe('delivered to concierge');
  });

  it('rejects invalid proof urls', async () => {
    const dto = plainToInstance(ConfirmDeliveryDto, {
      deliveryProofUrl: 'not-a-url',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'deliveryProofUrl')).toBe(
      true,
    );
  });

  it('ignores null optional confirmation fields', async () => {
    const dto = plainToInstance(ConfirmDeliveryDto, {
      deliveryProofUrl: null,
      deliveryNotes: null,
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.deliveryProofUrl).toBeNull();
    expect(dto.deliveryNotes).toBeNull();
  });
});
