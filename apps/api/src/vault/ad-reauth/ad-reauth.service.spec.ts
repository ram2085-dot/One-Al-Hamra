import { Test } from '@nestjs/testing';
import { AdReauthService } from './ad-reauth.service';
import { PrismaService } from '../../common/prisma.service';
import { hashPassword } from './password-hash';

describe('AdReauthService', () => {
  let service: AdReauthService;
  const prisma = { adAccount: { findUnique: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [AdReauthService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(AdReauthService);
  });

  it('returns true when the password matches the stored AD hash', async () => {
    prisma.adAccount.findUnique.mockResolvedValue({ adUsername: 'fance', passwordHash: hashPassword('pw') });
    expect(await service.verify('fance', 'pw')).toBe(true);
  });

  it('returns false when the password is wrong', async () => {
    prisma.adAccount.findUnique.mockResolvedValue({ adUsername: 'fance', passwordHash: hashPassword('pw') });
    expect(await service.verify('fance', 'nope')).toBe(false);
  });

  it('returns false when the AD account does not exist', async () => {
    prisma.adAccount.findUnique.mockResolvedValue(null);
    expect(await service.verify('ghost', 'pw')).toBe(false);
  });
});
