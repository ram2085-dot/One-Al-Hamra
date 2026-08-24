import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { EntitlementDto } from './dto/entitlement.dto';

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

  async addEntitlement(actorId: string, serviceId: string, dto: EntitlementDto) {
    const created = await this.prisma.serviceEntitlement.create({
      data: { serviceId, department: dto.department, role: dto.role, group: dto.group },
    });
    await this.audit.record(actorId, 'ADMIN_CHANGE', serviceId, { action: 'add-entitlement', entitlement: dto });
    return created;
  }

  async removeEntitlement(actorId: string, serviceId: string, entitlementId: string) {
    await this.prisma.serviceEntitlement.delete({ where: { id: entitlementId } });
    await this.audit.record(actorId, 'ADMIN_CHANGE', serviceId, { action: 'remove-entitlement', entitlementId });
  }
}
