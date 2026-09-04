import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CredentialLaunchService } from './credential-launch.service';
import { CatalogService } from '../catalog/catalog.service';
import { CredentialCryptoService } from '../vault/credential-crypto.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma.service';
import { LaunchTokenStore } from './launch-token.store';

describe('CredentialLaunchService', () => {
  let service: CredentialLaunchService;
  const user = { id: 'u1' } as any;
  const prisma = { credential: { findFirst: jest.fn() } };
  const catalog = { assertEntitled: jest.fn().mockResolvedValue({ id: 's1' }) };
  const crypto = { decrypt: jest.fn((v: string) => v.replace(/^enc\((.*)\)$/, '$1')) };
  const audit = { record: jest.fn() };
  const config = { get: (k: string) => ({ API_BASE_URL: 'http://localhost:3001', WEB_BASE_URL: 'http://localhost:5173' } as any)[k] };
  let store: LaunchTokenStore;

  beforeEach(async () => {
    jest.clearAllMocks();
    store = new LaunchTokenStore();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CredentialLaunchService,
        { provide: CatalogService, useValue: catalog },
        { provide: CredentialCryptoService, useValue: crypto },
        { provide: AuditService, useValue: audit },
        { provide: PrismaService, useValue: prisma },
        { provide: LaunchTokenStore, useValue: store },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(CredentialLaunchService);
  });

  it('uses the default credential when no id is given, mints a token, logs CREDENTIAL_LAUNCH', async () => {
    prisma.credential.findFirst.mockResolvedValue({ id: 'c1', encUsername: 'enc(jdoe)', encPassword: 'enc(pw)', isDefault: true });
    const { injectUrl } = await service.resolve(user, 's1');
    const token = injectUrl.split('/').pop()!;
    expect(injectUrl.startsWith('http://localhost:3001/credential-launch/inject/')).toBe(true);
    expect(store.consume(token)).toEqual({
      username: 'jdoe', password: 'pw',
      failureRedirect: 'http://localhost:5173/services/s1/credentials?credentialLaunchFailed=1',
    });
    expect(audit.record).toHaveBeenCalledWith('u1', 'CREDENTIAL_LAUNCH', 's1', expect.objectContaining({ credentialId: 'c1' }));
  });

  it('uses the specified credential id when given', async () => {
    prisma.credential.findFirst.mockResolvedValue({ id: 'c2', encUsername: 'enc(x)', encPassword: 'enc(y)', isDefault: false });
    await service.resolve(user, 's1', 'c2');
    expect(prisma.credential.findFirst).toHaveBeenCalledWith({ where: { id: 'c2', userId: 'u1', serviceId: 's1' } });
  });

  it('400s when the user has no credential for the service', async () => {
    prisma.credential.findFirst.mockResolvedValue(null);
    await expect(service.resolve(user, 's1')).rejects.toThrow(BadRequestException);
    expect(audit.record).not.toHaveBeenCalled();
  });
});
