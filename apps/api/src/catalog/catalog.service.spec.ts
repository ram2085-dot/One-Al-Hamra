import { Test } from '@nestjs/testing';
import { CatalogService } from './catalog.service';
import { PrismaService } from '../common/prisma.service';

describe('CatalogService.listForUser', () => {
  let service: CatalogService;
  const prisma = { service: { findMany: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [CatalogService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(CatalogService);
  });

  it('queries only ACTIVE services matching the user department/role/group via OR-across-entitlement-rows', async () => {
    const user = { id: 'u1', department: 'Finance', role: 'EMPLOYEE' } as any;
    prisma.service.findMany.mockResolvedValue([]);

    await service.listForUser(user);

    expect(prisma.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'ACTIVE',
          entitlements: {
            some: {
              OR: [{ department: 'Finance' }, { role: 'EMPLOYEE' }],
            },
          },
        },
      }),
    );
  });
});
