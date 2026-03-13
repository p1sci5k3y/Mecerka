import { BadRequestException } from '@nestjs/common';

export function normalizeProductReference(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '');
}

export function assertDiscountPriceValid(
  price?: number,
  discountPrice?: number | null,
) {
  if (discountPrice === undefined || discountPrice === null) {
    return;
  }

  if (price === undefined) {
    return;
  }

  if (discountPrice >= price) {
    throw new BadRequestException(
      'discountPrice must be lower than the base price',
    );
  }
}
