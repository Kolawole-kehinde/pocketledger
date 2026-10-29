import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

@Injectable()
export class EmailPayloadEncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;
  private readonly keyVersion: string;

  constructor(private readonly configService: ConfigService) {
    const encodedKey = this.configService.get<string>(
      'EMAIL_PAYLOAD_ENCRYPTION_KEY',
    );

    this.keyVersion =
      this.configService.get<string>('EMAIL_PAYLOAD_ENCRYPTION_KEY_VERSION') ??
      'v1';

    if (!encodedKey) {
      throw new InternalServerErrorException(
        'Email payload encryption key is not configured',
      );
    }

    const key = Buffer.from(encodedKey, 'base64');

    if (key.length !== 32) {
      throw new InternalServerErrorException(
        'Email payload encryption key must decode to 32 bytes',
      );
    }

    this.key = key;
  }

  encrypt(payload: Record<string, unknown>): {
    encryptedPayload: string;
    encryptionKeyVersion: string;
  } {
    const iv = randomBytes(12);
    const cipher = createCipheriv(this.algorithm, this.key, iv);

    const plaintext = JSON.stringify(payload);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return {
      encryptedPayload: [
        iv.toString('base64'),
        authTag.toString('base64'),
        encrypted.toString('base64'),
      ].join(':'),
      encryptionKeyVersion: this.keyVersion,
    };
  }

  decrypt<T extends Record<string, unknown>>(
  encryptedPayload: string,
  encryptionKeyVersion: string,
): T {
  if (encryptionKeyVersion !== this.keyVersion) {
    throw new InternalServerErrorException(
      `Unsupported email payload encryption key version: ${encryptionKeyVersion}`,
    );
  }

  try {
    const parts = encryptedPayload.split(':');

    if (parts.length !== 3) {
      throw new Error('Invalid encrypted payload format');
    }

    const [ivBase64, authTagBase64, ciphertextBase64] = parts;

    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');
    const ciphertext = Buffer.from(ciphertextBase64, 'base64');

    if (iv.length !== 12 || authTag.length !== 16) {
      throw new Error('Invalid encrypted payload components');
    }

    const decipher = createDecipheriv(
      this.algorithm,
      this.key,
      iv,
    );

    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');

    return JSON.parse(plaintext) as T;
  } catch {
    throw new InternalServerErrorException(
      'Unable to decrypt email payload',
    );
  }
}
}
