import { Test } from '@nestjs/testing';
import { CredentialCryptoService } from './credential-crypto.service';
import { KeyProvider } from './key-provider';
import { randomBytes } from 'crypto';

describe('CredentialCryptoService', () => {
  let service: CredentialCryptoService;
  const key = randomBytes(32);

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CredentialCryptoService,
        { provide: KeyProvider, useValue: { getKey: () => key } },
      ],
    }).compile();
    service = moduleRef.get(CredentialCryptoService);
  });

  it('round-trips a value', () => {
    const blob = service.encrypt('hunter2');
    expect(blob).not.toContain('hunter2');
    expect(service.decrypt(blob)).toBe('hunter2');
  });

  it('produces a different blob each call (random IV) but both decrypt equal', () => {
    const a = service.encrypt('same');
    const b = service.encrypt('same');
    expect(a).not.toBe(b);
    expect(service.decrypt(a)).toBe('same');
    expect(service.decrypt(b)).toBe('same');
  });

  it('rejects a tampered blob (auth tag failure)', () => {
    const blob = Buffer.from(service.encrypt('secret'), 'base64');
    blob[blob.length - 1] ^= 0xff;
    expect(() => service.decrypt(blob.toString('base64'))).toThrow();
  });
});
