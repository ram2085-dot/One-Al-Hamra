import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { AuditModule } from '../audit/audit.module';
import { VaultModule } from '../vault/vault.module';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CredentialLaunchController } from './credential-launch.controller';
import { CredentialLaunchService } from './credential-launch.service';
import { LaunchTokenStore } from './launch-token.store';

@Module({
  imports: [AuthModule, CatalogModule, AuditModule, VaultModule],
  controllers: [CredentialLaunchController],
  providers: [CredentialLaunchService, LaunchTokenStore, PrismaService, AuditService],
})
export class CredentialLaunchModule {}
