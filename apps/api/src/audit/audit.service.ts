import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async record(userId: string, eventType: string, serviceId?: string, metadata?: Record<string, unknown>) {
    await this.prisma.auditLog.create({ data: { userId, eventType, serviceId, metadata } });
  }
}
