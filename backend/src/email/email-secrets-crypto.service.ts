import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';

const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const DERIVATION_SALT = 'mecerka-email-connectors-v1';

export interface EncryptedPayload {
  algorithm: 'aes-256-gcm';
  keyDerivation: 'scrypt';
  keyVersion: 'v1';
  iv: string;
  tag: string;
  ciphertext: string;
}

export interface SecretFingerprint {
  algorithm: 'scrypt';
  salt: string;
  hash: string;
}

@Injectable()
export class EmailSecretsCryptoService {
  private readonly logger = new Logger(EmailSecretsCryptoService.name);

  /* istanbul ignore next -- generated decorator metadata branch */
  constructor(private readonly configService: ConfigService) {}

  encryptJson(value: Record<string, unknown>): EncryptedPayload {
    const key = this.deriveKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return {
      algorithm: 'aes-256-gcm',
      keyDerivation: 'scrypt',
      keyVersion: 'v1',
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };
  }

  decryptJson<T extends Record<string, unknown>>(payload: EncryptedPayload): T {
    const key = this.deriveKey();
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(payload.iv, 'base64'),
      {
        authTagLength: AUTH_TAG_LENGTH,
      },
    );
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');

    return JSON.parse(plaintext) as T;
  }

  fingerprintJson(value: Record<string, unknown>): SecretFingerprint {
    const salt = randomBytes(16);
    const normalized = Buffer.from(JSON.stringify(value), 'utf8');
    const hash = scryptSync(normalized, salt, KEY_LENGTH);

    return {
      algorithm: 'scrypt',
      salt: salt.toString('base64'),
      hash: hash.toString('base64'),
    };
  }

  verifyFingerprint(
    value: Record<string, unknown>,
    fingerprint: SecretFingerprint,
  ) {
    const normalized = Buffer.from(JSON.stringify(value), 'utf8');
    const hash = scryptSync(
      normalized,
      Buffer.from(fingerprint.salt, 'base64'),
      KEY_LENGTH,
    );

    return hash.toString('base64') === fingerprint.hash;
  }

  private deriveKey() {
    const nodeEnv =
      this.configService.get<string>('NODE_ENV')?.trim() ||
      process.env.NODE_ENV?.trim() ||
      'development';
    const masterSecret =
      this.configService.get<string>('SYSTEM_SETTINGS_MASTER_KEY')?.trim() ||
      process.env.SYSTEM_SETTINGS_MASTER_KEY?.trim();

    if (masterSecret) {
      return scryptSync(masterSecret, DERIVATION_SALT, KEY_LENGTH);
    }

    if (nodeEnv === 'production') {
      this.logger.error(
        'SYSTEM_SETTINGS_MASTER_KEY is required in production for encrypted system settings',
      );
      throw new Error('SYSTEM_SETTINGS_MASTER_KEY is required in production');
    }

    const jwtSecret =
      this.configService.get<string>('JWT_SECRET')?.trim() ||
      process.env.JWT_SECRET?.trim();

    if (!jwtSecret) {
      this.logger.error('No encryption key material is configured');
      throw new Error(
        'SYSTEM_SETTINGS_MASTER_KEY or JWT_SECRET configuration is required',
      );
    }

    return scryptSync(jwtSecret, DERIVATION_SALT, KEY_LENGTH);
  }
}
