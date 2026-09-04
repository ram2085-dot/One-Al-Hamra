import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';
import { CatalogService } from '../catalog/catalog.service';
import { CredentialCryptoService } from '../vault/credential-crypto.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma.service';
import { LaunchTokenStore } from './launch-token.store';

@Injectable()
export class CredentialLaunchService {
  constructor(
    private catalog: CatalogService,
    private crypto: CredentialCryptoService,
    private audit: AuditService,
    private prisma: PrismaService,
    private tokens: LaunchTokenStore,
    private config: ConfigService,
  ) {}

  async resolve(user: User, serviceId: string, credentialId?: string): Promise<{ injectUrl: string }> {
    await this.catalog.assertEntitled(user, serviceId);
    const where = credentialId
      ? { id: credentialId, userId: user.id, serviceId }
      : { userId: user.id, serviceId, isDefault: true };
    const credential = await this.prisma.credential.findFirst({ where });
    if (!credential) {
      throw new BadRequestException("You don't have a saved credential for this service yet.");
    }
    const failureRedirect =
      `${this.config.get<string>('WEB_BASE_URL')}/services/${serviceId}/credentials?credentialLaunchFailed=1`;
    const token = this.tokens.mint({
      username: this.crypto.decrypt(credential.encUsername),
      password: this.crypto.decrypt(credential.encPassword),
      failureRedirect,
    });
    await this.audit.record(user.id, 'CREDENTIAL_LAUNCH', serviceId, { credentialId: credential.id });
    return { injectUrl: `${this.config.get<string>('API_BASE_URL')}/credential-launch/inject/${token}` };
  }
}
