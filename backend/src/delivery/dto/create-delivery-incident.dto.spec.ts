import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDeliveryIncidentDto } from './create-delivery-incident.dto';

describe('CreateDeliveryIncidentDto', () => {
  it('trims valid incident payloads and accepts https evidence urls', async () => {
    const dto = plainToInstance(CreateDeliveryIncidentDto, {
      deliveryOrderId: '4f99868d-6954-4980-8ad1-1cb42fd64080',
      type: 'FAILED_DELIVERY',
      description: '  client was unavailable at the door  ',
      evidenceUrl: ' https://example.com/evidence.png ',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.description).toBe('client was unavailable at the door');
    expect(dto.evidenceUrl).toBe('https://example.com/evidence.png');
  });

  it('rejects short descriptions and non-https evidence urls', async () => {
    const dto = plainToInstance(CreateDeliveryIncidentDto, {
      deliveryOrderId: '4f99868d-6954-4980-8ad1-1cb42fd64080',
      type: 'FAILED_DELIVERY',
      description: 'bad',
      evidenceUrl: 'http://example.com/evidence.png',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'description')).toBe(true);
    expect(errors.some((error) => error.property === 'evidenceUrl')).toBe(true);
  });

  it('keeps non-string transforms untouched and still validates them', async () => {
    const dto = plainToInstance(CreateDeliveryIncidentDto, {
      deliveryOrderId: '4f99868d-6954-4980-8ad1-1cb42fd64080',
      type: 'FAILED_DELIVERY',
      description: 42,
      evidenceUrl: null,
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'description')).toBe(true);
    expect(errors.every((error) => error.property !== 'evidenceUrl')).toBe(
      true,
    );
    expect(dto.description).toBe(42);
    expect(dto.evidenceUrl).toBeNull();
  });
});
