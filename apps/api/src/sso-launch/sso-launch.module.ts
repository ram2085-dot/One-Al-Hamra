import { Module } from '@nestjs/common';
import { SsoLaunchController } from './sso-launch.controller';
import { SsoLaunchService } from './sso-launch.service';
import { CatalogModule } from '../catalog/catalog.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule, CatalogModule, AuditModule],
  controllers: [SsoLaunchController],
  providers: [SsoLaunchService],
})
export class SsoLaunchModule {}
