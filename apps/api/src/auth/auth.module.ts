import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { OidcService } from './oidc.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  providers: [AuthService, OidcService, PrismaService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
