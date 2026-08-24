import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async listAll() {
    return this.prisma.service.findMany({ where: undefined, orderBy: { name: 'asc' } });
  }

  async createService(actorId: string, dto: CreateServiceDto) {
    const created = await this.prisma.service.create({ data: dto });
    await this.audit.record(actorId, 'ADMIN_CHANGE', created.id, { action: 'create', fields: dto });
    return created;
  }

  async updateService(actorId: string, id: string, dto: UpdateServiceDto) {
    const updated = await this.prisma.service.update({ where: { id }, data: dto });
    await this.audit.record(actorId, 'ADMIN_CHANGE', id, { action: 'update', fields: dto });
    return updated;
  }
}
