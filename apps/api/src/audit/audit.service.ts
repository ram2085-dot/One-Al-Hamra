import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  // `metadata` is typed as Prisma.InputJsonValue (not Record<string, unknown>) because Prisma's
  // generated create input only accepts Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue;
  // `unknown` is not assignable to that.
  async record(userId: string, eventType: string, serviceId?: string, metadata?: Prisma.InputJsonValue) {
    await this.prisma.auditLog.create({ data: { userId, eventType, serviceId, metadata } });
  }
}
