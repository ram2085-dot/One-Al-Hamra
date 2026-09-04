import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Swap seam for a real KMS: a KMS-backed implementation replaces EnvKeyProvider, nothing else. */
export abstract class KeyProvider {
  abstract getKey(): Buffer;
}

@Injectable()
export class EnvKeyProvider extends KeyProvider {
  constructor(private config: ConfigService) {
    super();
  }

  getKey(): Buffer {
    const hex = this.config.get<string>('CREDENTIAL_VAULT_KEY');
    if (!hex || hex.length !== 64) {
      throw new Error('CREDENTIAL_VAULT_KEY must be set to 64 hex characters (32 bytes)');
    }
    return Buffer.from(hex, 'hex');
  }
}
