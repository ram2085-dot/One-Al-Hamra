import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
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
}
