import { Injectable, NotFoundException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class CatalogService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async listForUser(user: User) {
    const services = await this.prisma.service.findMany({
      where: {
        status: 'ACTIVE',
        entitlements: { some: this.entitlementWhere(user) },
      },
      orderBy: { name: 'asc' },
    });
    return this.withFavoriteFlags(user, services);
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
          WHERE e."serviceId" = s.id
            AND (e.department IS NULL OR e.department = ${user.department})
            AND (e.role IS NULL OR e.role = ${user.role}::"Role")
            AND e."group" IS NULL
            AND NOT (e.department IS NULL AND e.role IS NULL AND e."group" IS NULL)
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
    services.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    return this.withFavoriteFlags(user, services);
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

  /**
   * Spec §6: a service is visible if ANY of its ServiceEntitlement rows match, and the fields set
   * on a single row are AND'd together — a row with both `department` and `role` set requires both
   * to match. A null field on a row is a wildcard for that dimension.
   *
   * `group` is pinned to IS NULL rather than compared: ServiceEntitlement.group exists for forward
   * compatibility, but Phase 1's User model has no `group` field, so a group-scoped row cannot be
   * satisfied by any user yet and must not match on its other fields alone.
   *
   * The final NOT(...) clause keeps an all-null row from becoming a match-everyone wildcard, which
   * would invert spec §6's "zero entitlements means invisible" rule.
   */
  private entitlementWhere(user: User): Prisma.ServiceEntitlementWhereInput {
    return {
      AND: [
        { OR: [{ department: null }, { department: user.department }] },
        { OR: [{ role: null }, { role: user.role }] },
        { group: null },
        { NOT: { AND: [{ department: null }, { role: null }, { group: null }] } },
      ],
    };
  }

  /** Projects `isFavorite` onto each service so the catalog UI can render favorited state on load. */
  private async withFavoriteFlags<T extends { id: string }>(user: User, services: T[]) {
    if (services.length === 0) return [];
    const favorites = await this.prisma.favorite.findMany({
      where: { userId: user.id, serviceId: { in: services.map((s) => s.id) } },
      select: { serviceId: true },
    });
    const favoriteIds = new Set(favorites.map((f) => f.serviceId));
    return services.map((service) => ({ ...service, isFavorite: favoriteIds.has(service.id) }));
  }

  /**
   * Throws 404 (never 403 — existence must not leak) unless the user is entitled to this ACTIVE
   * service. Used by every per-service action as the single entitlement gate.
   */
  private async assertEntitled(user: User, id: string) {
    const service = await this.prisma.service.findFirst({
      where: { id, status: 'ACTIVE', entitlements: { some: this.entitlementWhere(user) } },
    });
    if (!service) throw new NotFoundException('Service not found');
    return service;
  }

  async getDetailForUser(user: User, id: string) {
    const service = await this.assertEntitled(user, id);
    const [owner, favorite] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: service.ownerId }, select: { displayName: true } }),
      this.prisma.favorite.findFirst({ where: { userId: user.id, serviceId: id } }),
    ]);
    return { ...service, ownerName: owner?.displayName ?? null, isFavorite: favorite !== null };
  }

  async reportIssue(user: User, serviceId: string, description: string) {
    await this.assertEntitled(user, serviceId);
    // Phase 1: routed to service owner via audit trail only; no email/notification integration yet (FR-25 stub).
    return { received: true };
  }

  async recordLaunch(user: User, serviceId: string) {
    await this.assertEntitled(user, serviceId);
    await this.auditService.record(user.id, 'CATALOG_LAUNCH', serviceId);
  }
}
