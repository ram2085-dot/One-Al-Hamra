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
            OR: [{ department: user.department }, { role: user.role }],
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }
}
