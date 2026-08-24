import { Test } from '@nestjs/testing';
import { CatalogService } from './catalog.service';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Minimal evaluator for the subset of Prisma `where` syntax this service emits for entitlements
 * (AND / OR / NOT plus scalar equality). It lets the specs assert the *semantics* of the generated
 * predicate against concrete ServiceEntitlement rows rather than only its literal shape.
 */
type EntitlementRow = { department: string | null; role: string | null; group: string | null };

function matches(where: any, row: EntitlementRow): boolean {
  if (Array.isArray(where.AND)) return where.AND.every((w: any) => matches(w, row));
  if (Array.isArray(where.OR)) return where.OR.some((w: any) => matches(w, row));
  if (where.NOT) return !matches(where.NOT, row);
  return Object.entries(where).every(([field, value]) => (row as any)[field] === value);
}

describe('CatalogService.listForUser', () => {
  let service: CatalogService;
  const prisma = { service: { findMany: jest.fn() }, favorite: { findMany: jest.fn() } };
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

  async function capturedEntitlementWhere(user: any) {
    prisma.service.findMany.mockResolvedValue([]);
    await service.listForUser(user);
    return prisma.service.findMany.mock.calls[0][0].where.entitlements.some;
  }

  it('queries only ACTIVE services, OR-ing across entitlement rows and AND-ing the fields within a row (spec §6)', async () => {
    const user = { id: 'u1', department: 'Finance', role: 'EMPLOYEE' } as any;
    prisma.service.findMany.mockResolvedValue([]);

    await service.listForUser(user);

    expect(prisma.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'ACTIVE',
          entitlements: {
            some: {
              AND: [
                { OR: [{ department: null }, { department: 'Finance' }] },
                { OR: [{ role: null }, { role: 'EMPLOYEE' }] },
                { group: null },
                { NOT: { AND: [{ department: null }, { role: null }, { group: null }] } },
              ],
            },
          },
        },
      }),
    );
  });

  it('does NOT match a department+role row when only the department matches (AND within a row)', async () => {
    const user = { id: 'u1', department: 'Finance', role: 'EMPLOYEE' } as any;
    const where = await capturedEntitlementWhere(user);

    // "Finance service owners only" — must not be visible to an ordinary Finance employee.
    expect(matches(where, { department: 'Finance', role: 'SERVICE_OWNER', group: null })).toBe(false);
    // ...nor to a SERVICE_OWNER in another department (covered by the department half).
    expect(matches(where, { department: 'Engineering', role: 'EMPLOYEE', group: null })).toBe(false);
    // A row scoped to exactly this user's department+role does match.
    expect(matches(where, { department: 'Finance', role: 'EMPLOYEE', group: null })).toBe(true);
    // Single-field rows still act as wildcards on the unset dimension.
    expect(matches(where, { department: 'Finance', role: null, group: null })).toBe(true);
    expect(matches(where, { department: null, role: 'EMPLOYEE', group: null })).toBe(true);
    // An all-null row must not become a match-everyone wildcard.
    expect(matches(where, { department: null, role: null, group: null })).toBe(false);
    // Phase 1 has no User.group, so a group-scoped row is unmatchable.
    expect(matches(where, { department: 'Finance', role: null, group: 'finance-admins' })).toBe(false);
  });

  it('projects isFavorite onto each returned service', async () => {
    const user = { id: 'u1', department: 'Finance', role: 'EMPLOYEE' } as any;
    prisma.service.findMany.mockResolvedValue([{ id: 's1', name: 'A' }, { id: 's2', name: 'B' }]);
    prisma.favorite.findMany.mockResolvedValue([{ serviceId: 's2' }]);

    const result = await service.listForUser(user);

    expect(result).toEqual([
      { id: 's1', name: 'A', isFavorite: false },
      { id: 's2', name: 'B', isFavorite: true },
    ]);
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
