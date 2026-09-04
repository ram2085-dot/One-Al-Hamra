import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { AdminModule } from './admin/admin.module';
import { SsoLaunchModule } from './sso-launch/sso-launch.module';
import { VaultModule } from './vault/vault.module';
import { AuthGuard } from './common/guards/auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule, CatalogModule, AdminModule, SsoLaunchModule, VaultModule],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
