import { Test } from '@nestjs/testing';
import { VaultService } from './vault.service';
import { CatalogService } from '../catalog/catalog.service';
import { AdReauthService } from './ad-reauth/ad-reauth.service';
import { LockoutService } from './lockout.service';
import { ReauthTokenStore } from './reauth-token.store';
import { CredentialCryptoService } from './credential-crypto.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma.service';

describe('VaultService — credentials', () => {
  let service: VaultService;
  const user = { id: 'u1', adUsername: 'fance' } as any;

  const prisma: any = {
    credential: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
    $transaction: jest.fn(async (fns: any) => (Array.isArray(fns) ? Promise.all(fns) : fns(prisma))),
  };
  const catalog = { assertEntitled: jest.fn().mockResolvedValue({ id: 's1' }) };
  const crypto = {
    encrypt: jest.fn((v: string) => `enc(${v})`),
    decrypt: jest.fn((v: string) => v.replace(/^enc\((.*)\)$/, '$1')),
  };
  const audit = { record: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        VaultService,
        { provide: CatalogService, useValue: catalog },
        { provide: AdReauthService, useValue: { verify: jest.fn() } },
        { provide: LockoutService, useValue: { assertNotLocked: jest.fn(), recordFailure: jest.fn(), reset: jest.fn() } },
        { provide: ReauthTokenStore, useValue: { issue: jest.fn(), consume: jest.fn() } },
        { provide: CredentialCryptoService, useValue: crypto },
        { provide: AuditService, useValue: audit },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(VaultService);
  });

  it('listForService returns decrypted usernames and never a password field', async () => {
    prisma.credential.findMany.mockResolvedValue([
      { id: 'c1', label: 'main', encUsername: 'enc(jdoe)', encPassword: 'enc(secret)', isDefault: true, lastRotatedAt: new Date(0), passwordExpiresAt: null },
    ]);
    const list = await service.listForService(user, 's1');
    expect(list).toEqual([
      { id: 'c1', label: 'main', username: 'jdoe', isDefault: true, lastRotatedAt: new Date(0), passwordExpiresAt: null },
    ]);
    expect(JSON.stringify(list)).not.toContain('secret');
    expect(catalog.assertEntitled).toHaveBeenCalledWith(user, 's1');
  });

  it('createCredential encrypts both fields, makes the first credential default, and writes a CREDENTIAL_UPDATE audit row', async () => {
    prisma.credential.findMany.mockResolvedValue([]); // no existing credentials
    prisma.credential.create.mockResolvedValue({
      id: 'c1', label: null, encUsername: 'enc(jdoe)', encPassword: 'enc(pw)', isDefault: true, lastRotatedAt: new Date(0), passwordExpiresAt: null,
    });
    const item = await service.createCredential(user, 's1', { username: 'jdoe', password: 'pw' });
    expect(crypto.encrypt).toHaveBeenCalledWith('jdoe');
    expect(crypto.encrypt).toHaveBeenCalledWith('pw');
    expect(prisma.credential.create.mock.calls[0][0].data.isDefault).toBe(true);
    expect(item.username).toBe('jdoe');
    expect(audit.record).toHaveBeenCalledWith('u1', 'CREDENTIAL_UPDATE', 's1', expect.objectContaining({ action: 'create' }));
  });

  it('createCredential does not force default when the user already has a credential', async () => {
    prisma.credential.findMany.mockResolvedValue([{ id: 'existing' }]);
    prisma.credential.create.mockResolvedValue({
      id: 'c2', label: null, encUsername: 'enc(x)', encPassword: 'enc(y)', isDefault: false, lastRotatedAt: new Date(0), passwordExpiresAt: null,
    });
    await service.createCredential(user, 's1', { username: 'x', password: 'y' });
    expect(prisma.credential.create.mock.calls[0][0].data.isDefault).toBe(false);
  });
});
