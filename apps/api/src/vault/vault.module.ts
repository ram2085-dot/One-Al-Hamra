import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { AuditModule } from '../audit/audit.module';
import { PrismaService } from '../common/prisma.service';
import { VaultController } from './vault.controller';
import { VaultService } from './vault.service';
import { CredentialCryptoService } from './credential-crypto.service';
import { KeyProvider, EnvKeyProvider } from './key-provider';
import { LockoutService } from './lockout.service';
import { ReauthTokenStore } from './reauth-token.store';
import { AdReauthService } from './ad-reauth/ad-reauth.service';

@Module({
  imports: [AuthModule, CatalogModule, AuditModule],
  controllers: [VaultController],
  providers: [
    VaultService,
    CredentialCryptoService,
    { provide: KeyProvider, useClass: EnvKeyProvider },
    LockoutService,
    ReauthTokenStore,
    AdReauthService,
    PrismaService,
  ],
  exports: [CredentialCryptoService, ReauthTokenStore],
})
export class VaultModule {}
