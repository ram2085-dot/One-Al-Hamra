import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { EntitlementDto } from './dto/entitlement.dto';
import { AliasDto } from './dto/alias.dto';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async listAll() {
    // entitlements/aliases are included so the admin console can list and remove existing rows
    // without needing a second per-service round trip.
    return this.prisma.service.findMany({
      where: undefined,
      orderBy: { name: 'asc' },
      include: { entitlements: true, aliases: true },
    });
  }

  async createService(actorId: string, dto: CreateServiceDto) {
    const created = await this.prisma.service.create({ data: dto });
    await this.audit.record(actorId, 'ADMIN_CHANGE', created.id, { action: 'create', fields: { ...dto } });
    return created;
  }

  async updateService(actorId: string, id: string, dto: UpdateServiceDto) {
    const updated = await this.prisma.service.update({ where: { id }, data: dto });
    await this.audit.record(actorId, 'ADMIN_CHANGE', id, { action: 'update', fields: { ...dto } });
    return updated;
  }

  async addEntitlement(actorId: string, serviceId: string, dto: EntitlementDto) {
    const created = await this.prisma.serviceEntitlement.create({
      data: { serviceId, department: dto.department, role: dto.role, group: dto.group },
    });
    await this.audit.record(actorId, 'ADMIN_CHANGE', serviceId, { action: 'add-entitlement', entitlement: { ...dto } });
    return created;
  }

  async removeEntitlement(actorId: string, serviceId: string, entitlementId: string) {
    try {
      await this.prisma.serviceEntitlement.delete({ where: { id: entitlementId } });
    } catch (err) {
      if (isRecordNotFound(err)) throw new NotFoundException('Entitlement not found');
      throw err;
    }
    await this.audit.record(actorId, 'ADMIN_CHANGE', serviceId, { action: 'remove-entitlement', entitlementId });
  }

  async addAlias(actorId: string, serviceId: string, dto: AliasDto) {
    const created = await this.prisma.serviceAlias.create({ data: { serviceId, alias: dto.alias } });
    await this.audit.record(actorId, 'ADMIN_CHANGE', serviceId, { action: 'add-alias', alias: dto.alias });
    return created;
  }

  async removeAlias(actorId: string, serviceId: string, aliasId: string) {
    try {
      await this.prisma.serviceAlias.delete({ where: { id: aliasId } });
    } catch (err) {
      if (isRecordNotFound(err)) throw new NotFoundException('Alias not found');
      throw err;
    }
    await this.audit.record(actorId, 'ADMIN_CHANGE', serviceId, { action: 'remove-alias', aliasId });
  }
}

/**
 * Prisma raises P2025 ("An operation failed because it depends on one or more records that were
 * required but not found") when `delete` targets a missing row. Callers surface that as a 404
 * rather than letting it bubble up as a 500; every other error propagates unchanged.
 */
function isRecordNotFound(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';
}
