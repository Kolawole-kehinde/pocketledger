import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

@Injectable()
export class EmailPayloadEncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keys: Map<string, Buffer>;
  private readonly activeKeyVersion: string;

  constructor(private readonly configService: ConfigService) {
    const encodedKeys = this.configService.get<string>(
      'EMAIL_PAYLOAD_ENCRYPTION_KEYS',
    );

    if (!encodedKeys) {
      throw new InternalServerErrorException(
        'Email payload encryption keys are not configured',
      );
    }

    let parsedKeys: Record<string, string>;

    try {
      parsedKeys = JSON.parse(encodedKeys);
    } catch {
      throw new InternalServerErrorException(
        'Invalid email payload encryption key configuration',
      );
    }

    if (
      !parsedKeys ||
      typeof parsedKeys !== 'object' ||
      Array.isArray(parsedKeys) ||
      Object.keys(parsedKeys).length === 0
    ) {
      throw new InternalServerErrorException(
        'At least one email payload encryption key is required',
      );
    }

    this.keys = new Map();

    for (const [version, encodedKey] of Object.entries(parsedKeys)) {
      if (!version || typeof encodedKey !== 'string') {
        throw new InternalServerErrorException(
          'Invalid email payload encryption key entry',
        );
      }

      const key = Buffer.from(encodedKey, 'base64');

      if (key.length !== 32) {
        throw new InternalServerErrorException(
          `Encryption key ${version} must decode to 32 bytes`,
        );
      }

      this.keys.set(version, key);
    }

    this.activeKeyVersion =
      this.configService.get<string>(
        'EMAIL_PAYLOAD_ENCRYPTION_ACTIVE_VERSION',
      ) ?? 'v1';

    if (!this.keys.has(this.activeKeyVersion)) {
      throw new InternalServerErrorException(
        'Active email payload encryption key version is unavailable',
      );
    }
  }

  encrypt(payload: Record<string, unknown>): {
    encryptedPayload: string;
    encryptionKeyVersion: string;
  } {
    const key = this.keys.get(this.activeKeyVersion);

    if (!key) {
      throw new InternalServerErrorException(
        'Active encryption key is unavailable',
      );
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv(this.algorithm, key, iv);

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
      encryptionKeyVersion: this.activeKeyVersion,
    };
  }

  decrypt<T extends Record<string, unknown>>(
    encryptedPayload: string,
    encryptionKeyVersion: string,
  ): T {
    const key = this.keys.get(encryptionKeyVersion);

    if (!key) {
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

      const decipher = createDecipheriv(this.algorithm, key, iv);

      decipher.setAuthTag(authTag);

      const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString('utf8');

      return JSON.parse(plaintext) as T;
    } catch {
      throw new InternalServerErrorException('Unable to decrypt email payload');
    }
  }
}
