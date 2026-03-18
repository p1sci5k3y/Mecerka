import { Injectable } from '@nestjs/common';
import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const NIF_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
const CIF_CONTROL_LETTERS = 'JABCDEFGHI';

function normalizeFiscalId(value: string) {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

function isValidNif(value: string) {
  if (!/^\d{8}[A-Z]$/.test(value)) {
    return false;
  }

  const digits = Number.parseInt(value.slice(0, 8), 10);
  const expectedLetter = NIF_LETTERS[digits % 23];
  return value[8] === expectedLetter;
}

function isValidNie(value: string) {
  if (!/^[XYZ]\d{7}[A-Z]$/.test(value)) {
    return false;
  }

  const prefixMap: Record<string, string> = {
    X: '0',
    Y: '1',
    Z: '2',
  };
  const normalized = `${prefixMap[value[0]]}${value.slice(1, 8)}`;
  const digits = Number.parseInt(normalized, 10);
  const expectedLetter = NIF_LETTERS[digits % 23];
  return value[8] === expectedLetter;
}

function isValidCif(value: string) {
  if (!/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(value)) {
    return false;
  }

  const controlType = value[0];
  const digits = value.slice(1, 8);
  const controlChar = value[8];

  let evenSum = 0;
  let oddSum = 0;

  for (let index = 0; index < digits.length; index += 1) {
    const digit = Number.parseInt(digits[index]!, 10);
    if ((index + 1) % 2 === 0) {
      evenSum += digit;
      continue;
    }

    const doubled = digit * 2;
    oddSum += Math.floor(doubled / 10) + (doubled % 10);
  }

  const total = evenSum + oddSum;
  const controlDigit = (10 - (total % 10)) % 10;
  const expectedDigit = String(controlDigit);
  const expectedLetter = CIF_CONTROL_LETTERS[controlDigit];

  if ('PQRSNW'.includes(controlType)) {
    return controlChar === expectedLetter;
  }

  if ('ABEH'.includes(controlType)) {
    return controlChar === expectedDigit;
  }

  return controlChar === expectedDigit || controlChar === expectedLetter;
}

export function isValidSpanishFiscalId(value: string, country?: string) {
  if (country !== undefined && typeof country !== 'string') {
    return false;
  }

  if (country && country.toUpperCase() !== 'ES') {
    return false;
  }

  const normalized = normalizeFiscalId(value);

  return (
    isValidNif(normalized) || isValidNie(normalized) || isValidCif(normalized)
  );
}

export function normalizeSpanishFiscalId(value: string) {
  return normalizeFiscalId(value);
}

@Injectable()
@ValidatorConstraint({ name: 'isSpanishFiscalId', async: false })
export class IsSpanishFiscalIdConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments) {
    if (typeof value !== 'string') {
      return false;
    }

    const object = args.object as { country?: string };
    return isValidSpanishFiscalId(value, object.country);
  }

  defaultMessage(args: ValidationArguments) {
    const object = args.object as { country?: unknown };
    if (typeof object.country !== 'string') {
      return 'country must be a two-letter ISO country code';
    }

    if (object.country && object.country.toUpperCase() !== 'ES') {
      return 'Only ES fiscal IDs are currently supported';
    }

    return 'fiscalId must be a valid NIF, NIE, or CIF';
  }
}
