import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, UnauthorizedException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateCredentialDto } from './dto/create-credential.dto';
import { UpdateCredentialDto } from './dto/update-credential.dto';
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

  @Get(':serviceId/:credentialId/reveal')
  reveal(
    @CurrentUser() user: User,
    @Param('serviceId') serviceId: string,
    @Param('credentialId') credentialId: string,
    @Headers('x-reauth-token') reauthToken: string | undefined,
  ) {
    this.requireReauth(reauthToken, user.id, serviceId);
    return this.vault.revealCredential(user, serviceId, credentialId);
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

  // Declared before @Patch(':serviceId/:credentialId') so the literal `default`
  // segment wins over the :credentialId param.
  @Patch(':serviceId/:credentialId/default')
  @HttpCode(204)
  async makeDefault(
    @CurrentUser() user: User,
    @Param('serviceId') serviceId: string,
    @Param('credentialId') credentialId: string,
  ) {
    await this.vault.setDefault(user, serviceId, credentialId);
  }

  @Patch(':serviceId/:credentialId')
  update(
    @CurrentUser() user: User,
    @Param('serviceId') serviceId: string,
    @Param('credentialId') credentialId: string,
    @Headers('x-reauth-token') reauthToken: string | undefined,
    @Body() dto: UpdateCredentialDto,
  ) {
    this.requireReauth(reauthToken, user.id, serviceId);
    return this.vault.updateCredential(user, serviceId, credentialId, dto);
  }

  @Delete(':serviceId/:credentialId')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: User,
    @Param('serviceId') serviceId: string,
    @Param('credentialId') credentialId: string,
    @Headers('x-reauth-token') reauthToken: string | undefined,
  ) {
    this.requireReauth(reauthToken, user.id, serviceId);
    await this.vault.deleteCredential(user, serviceId, credentialId);
  }
}
