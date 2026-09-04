import { Body, Controller, Get, Headers, Param, Post, UnauthorizedException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateCredentialDto } from './dto/create-credential.dto';
import { ReauthDto } from './dto/reauth.dto';
import { ReauthTokenStore } from './reauth-token.store';
import { VaultService } from './vault.service';

@Controller('vault/credentials')
export class VaultController {
  constructor(
    private vault: VaultService,
    private reauthTokens: ReauthTokenStore,
  ) {}

  private requireReauth(token: string | undefined, userId: string, serviceId: string): void {
    if (!token || !this.reauthTokens.consume(token, userId, serviceId)) {
      throw new UnauthorizedException('Re-authentication required. Enter your Windows password to continue.');
    }
  }

  @Post(':serviceId/reauth')
  reauth(@CurrentUser() user: User, @Param('serviceId') serviceId: string, @Body() dto: ReauthDto) {
    return this.vault.reauth(user, serviceId, dto.adPassword);
  }

  @Get(':serviceId')
  list(@CurrentUser() user: User, @Param('serviceId') serviceId: string) {
    return this.vault.listForService(user, serviceId);
  }

  @Post(':serviceId')
  create(
    @CurrentUser() user: User,
    @Param('serviceId') serviceId: string,
    @Headers('x-reauth-token') reauthToken: string | undefined,
    @Body() dto: CreateCredentialDto,
  ) {
    this.requireReauth(reauthToken, user.id, serviceId);
    return this.vault.createCredential(user, serviceId, dto);
  }
}
