import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpsertProviderDto } from './upsert-provider.dto';

describe('UpsertProviderDto', () => {
  it('accepts valid provider payloads and normalizes non-array photos to empty arrays', async () => {
    const dto = plainToInstance(UpsertProviderDto, {
      slug: 'demo-workshop',
      businessName: 'Demo Workshop',
      cityId: '4f99868d-6954-4980-8ad1-1cb42fd64080',
      categoryId: '9c1fc56f-d632-4cb0-b01e-e907c3e54eb4',
      description: 'Workshop description',
      workshopHistory: 'Workshop history',
      photos: 'not-an-array',
      videoUrl: 'https://example.com/video',
      websiteUrl: 'https://example.com',
      isPublished: true,
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.photos).toEqual([]);
  });

  it('rejects invalid slugs and oversized photo arrays', async () => {
    const dto = plainToInstance(UpsertProviderDto, {
      slug: 'Bad Slug',
      businessName: 'Demo Workshop',
      cityId: '4f99868d-6954-4980-8ad1-1cb42fd64080',
      categoryId: '9c1fc56f-d632-4cb0-b01e-e907c3e54eb4',
      description: 'Workshop description',
      workshopHistory: 'Workshop history',
      photos: Array.from(
        { length: 11 },
        (_, index) => `https://example.com/${index}.jpg`,
      ),
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'slug')).toBe(true);
    expect(errors.some((error) => error.property === 'photos')).toBe(true);
  });
});
