import { Test } from '@nestjs/testing';
import { CatalogService } from './catalog.service';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('CatalogService.listForUser', () => {
  let service: CatalogService;
  const prisma = { service: { findMany: jest.fn() } };
  const audit = { record: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
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

  describe('CatalogService.search', () => {
    it('returns [] for a query with no matches rather than throwing', async () => {
      (prisma as any).$queryRaw = jest.fn().mockResolvedValue([]);
      const user = { id: 'u1', department: 'Finance', role: 'EMPLOYEE' } as any;
      const results = await service.search(user, 'zzzznomatch');
      expect(results).toEqual([]);
    });
  });

  describe('CatalogService favorites', () => {
    it('addFavorite is idempotent (upsert, not insert)', async () => {
      (prisma as any).favorite = { upsert: jest.fn().mockResolvedValue({}), deleteMany: jest.fn() };
      await service.addFavorite('u1', 's1');
      await service.addFavorite('u1', 's1');
      expect((prisma as any).favorite.upsert).toHaveBeenCalledTimes(2);
      expect((prisma as any).favorite.upsert).toHaveBeenCalledWith({
        where: { userId_serviceId: { userId: 'u1', serviceId: 's1' } },
        create: { userId: 'u1', serviceId: 's1' },
        update: {},
      });
    });

    it('removeFavorite does not throw when the favorite does not exist', async () => {
      (prisma as any).favorite = { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) };
      await expect(service.removeFavorite('u1', 's1')).resolves.not.toThrow();
    });
  });

  describe('CatalogService.recordLaunch', () => {
    it('records a CATALOG_LAUNCH audit event after confirming entitlement', async () => {
      const user = { id: 'u1', department: 'Finance', role: 'EMPLOYEE' } as any;
      prisma.service.findMany.mockResolvedValue([]);
      (prisma as any).service.findFirst = jest.fn().mockResolvedValue({ id: 's1', name: 'Finance Expense System' });

      await service.recordLaunch(user, 's1');

      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith('u1', 'CATALOG_LAUNCH', 's1');
    });

    it('does not record an audit event when the user is not entitled to the service', async () => {
      const user = { id: 'u1', department: 'Finance', role: 'EMPLOYEE' } as any;
      (prisma as any).service.findFirst = jest.fn().mockResolvedValue(null);

      await expect(service.recordLaunch(user, 's1')).rejects.toThrow('Service not found');
      expect(audit.record).not.toHaveBeenCalled();
    });
  });
});
