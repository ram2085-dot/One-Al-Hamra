import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class CatalogService {
  constructor(private prisma: PrismaService) {}

  async listForUser(user: User) {
    return this.prisma.service.findMany({
      where: {
        status: 'ACTIVE',
        entitlements: {
          some: {
            // `group` intentionally omitted: ServiceEntitlement.group exists for forward compatibility,
            // but Phase 1's User model has no `group` field, so no user can ever match a group-based entitlement yet.
            OR: [{ department: user.department }, { role: user.role }],
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async search(user: User, q: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; rank: number }>>(Prisma.sql`
      SELECT s.id,
        CASE
          WHEN lower(s.name) = lower(${q}) THEN 4
          WHEN EXISTS (SELECT 1 FROM "ServiceAlias" a WHERE a."serviceId" = s.id AND lower(a.alias) = lower(${q})) THEN 3
          ELSE GREATEST(
            similarity(s.name, ${q}),
            COALESCE((SELECT MAX(similarity(t, ${q})) FROM unnest(s.tags) t), 0),
            similarity(s.category, ${q})
          )
        END AS rank
      FROM "Service" s
      WHERE s.status = 'ACTIVE'
        AND EXISTS (
          SELECT 1 FROM "ServiceEntitlement" e
          WHERE e."serviceId" = s.id AND (e.department = ${user.department} OR e.role = ${user.role}::"Role")
        )
        AND (
          lower(s.name) = lower(${q})
          OR EXISTS (SELECT 1 FROM "ServiceAlias" a WHERE a."serviceId" = s.id AND lower(a.alias) = lower(${q}))
          OR similarity(s.name, ${q}) >= 0.3
          OR similarity(s.category, ${q}) >= 0.3
          OR EXISTS (SELECT 1 FROM unnest(s.tags) t WHERE similarity(t, ${q}) >= 0.3)
        )
      ORDER BY rank DESC
      LIMIT 25
    `);

    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const services = await this.prisma.service.findMany({ where: { id: { in: ids } } });
    const order = new Map(ids.map((id, i) => [id, i]));
    return services.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  }

  async addFavorite(userId: string, serviceId: string) {
    await this.prisma.favorite.upsert({
      where: { userId_serviceId: { userId, serviceId } },
      create: { userId, serviceId },
      update: {},
    });
  }

  async removeFavorite(userId: string, serviceId: string) {
    await this.prisma.favorite.deleteMany({ where: { userId, serviceId } });
  }
}
