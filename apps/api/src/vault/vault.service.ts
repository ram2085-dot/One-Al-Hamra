import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Credential, User } from '@prisma/client';
import { CatalogService } from '../catalog/catalog.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma.service';
import { AdReauthService } from './ad-reauth/ad-reauth.service';
import { CredentialCryptoService } from './credential-crypto.service';
import { LockoutService } from './lockout.service';
import { ReauthTokenStore } from './reauth-token.store';
import { CreateCredentialDto } from './dto/create-credential.dto';
import { UpdateCredentialDto } from './dto/update-credential.dto';

export interface CredentialListItem {
  id: string;
  label: string | null;
  username: string;
  isDefault: boolean;
  lastRotatedAt: Date;
  passwordExpiresAt: Date | null;
}

@Injectable()
export class VaultService {
  constructor(
    private catalog: CatalogService,
    private adReauth: AdReauthService,
    private lockout: LockoutService,
    private reauthTokens: ReauthTokenStore,
    private crypto: CredentialCryptoService,
    private audit: AuditService,
    private prisma: PrismaService,
  ) {}

  async reauth(user: User, serviceId: string, adPassword: string): Promise<{ reauthToken: string }> {
    await this.catalog.assertEntitled(user, serviceId); // 404 if not entitled — existence must not leak
    await this.lockout.assertNotLocked(user.id, serviceId);

    const ok = await this.adReauth.verify(user.adUsername, adPassword);
    if (!ok) {
      await this.lockout.recordFailure(user.id, serviceId); // may itself throw 423 on the 5th failure
      throw new UnauthorizedException("That password wasn't recognized.");
    }

    await this.lockout.reset(user.id, serviceId);
    return { reauthToken: this.reauthTokens.issue({ userId: user.id, serviceId }) };
  }

  private toListItem(row: Credential): CredentialListItem {
    return {
      id: row.id,
      label: row.label,
      username: this.crypto.decrypt(row.encUsername),
      isDefault: row.isDefault,
      lastRotatedAt: row.lastRotatedAt,
      passwordExpiresAt: row.passwordExpiresAt,
    };
  }

  async listForService(user: User, serviceId: string): Promise<CredentialListItem[]> {
    await this.catalog.assertEntitled(user, serviceId);
    const rows = await this.prisma.credential.findMany({
      where: { userId: user.id, serviceId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => this.toListItem(r));
  }

  async createCredential(user: User, serviceId: string, dto: CreateCredentialDto): Promise<CredentialListItem> {
    await this.catalog.assertEntitled(user, serviceId);
    const existing = await this.prisma.credential.findMany({
      where: { userId: user.id, serviceId },
      select: { id: true },
    });
    const isDefault = existing.length === 0;
    const row = await this.prisma.credential.create({
      data: {
        userId: user.id,
        serviceId,
        label: dto.label ?? null,
        encUsername: this.crypto.encrypt(dto.username),
        encPassword: this.crypto.encrypt(dto.password),
        isDefault,
        passwordExpiresAt: dto.passwordExpiresAt ? new Date(dto.passwordExpiresAt) : null,
      },
    });
    await this.audit.record(user.id, 'CREDENTIAL_UPDATE', serviceId, { action: 'create', credentialId: row.id });
    return this.toListItem(row);
  }

  private async ownedOrThrow(userId: string, serviceId: string, credentialId: string) {
    const row = await this.prisma.credential.findFirst({ where: { id: credentialId, userId, serviceId } });
    if (!row) throw new NotFoundException('Credential not found');
    return row;
  }

  async updateCredential(user: User, serviceId: string, credentialId: string, dto: UpdateCredentialDto): Promise<CredentialListItem> {
    await this.catalog.assertEntitled(user, serviceId);
    await this.ownedOrThrow(user.id, serviceId, credentialId);
    const data: Record<string, unknown> = {};
    if (dto.label !== undefined) data.label = dto.label;
    if (dto.username !== undefined) data.encUsername = this.crypto.encrypt(dto.username);
    if (dto.password !== undefined) {
      data.encPassword = this.crypto.encrypt(dto.password);
      data.lastRotatedAt = new Date();
    }
    if (dto.passwordExpiresAt !== undefined) data.passwordExpiresAt = dto.passwordExpiresAt ? new Date(dto.passwordExpiresAt) : null;
    const row = await this.prisma.credential.update({ where: { id: credentialId }, data });
    await this.audit.record(user.id, 'CREDENTIAL_UPDATE', serviceId, { action: 'update', credentialId });
    return this.toListItem(row);
  }

  async deleteCredential(user: User, serviceId: string, credentialId: string): Promise<void> {
    await this.catalog.assertEntitled(user, serviceId);
    const row = await this.ownedOrThrow(user.id, serviceId, credentialId);
    await this.prisma.credential.delete({ where: { id: credentialId } });
    if (row.isDefault) {
      const remaining = await this.prisma.credential.findMany({
        where: { userId: user.id, serviceId },
        orderBy: { createdAt: 'asc' },
        take: 1,
      });
      if (remaining[0]) {
        await this.prisma.credential.update({ where: { id: remaining[0].id }, data: { isDefault: true } });
      }
    }
    await this.audit.record(user.id, 'CREDENTIAL_UPDATE', serviceId, { action: 'delete', credentialId });
  }

  async setDefault(user: User, serviceId: string, credentialId: string): Promise<void> {
    await this.catalog.assertEntitled(user, serviceId);
    await this.ownedOrThrow(user.id, serviceId, credentialId);
    await this.prisma.$transaction([
      this.prisma.credential.updateMany({ where: { userId: user.id, serviceId }, data: { isDefault: false } }),
      this.prisma.credential.update({ where: { id: credentialId }, data: { isDefault: true } }),
    ]);
    await this.audit.record(user.id, 'CREDENTIAL_UPDATE', serviceId, { action: 'set-default', credentialId });
  }
}
