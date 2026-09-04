import { Body, Controller, Param, Post } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ReauthDto } from './dto/reauth.dto';
import { VaultService } from './vault.service';

@Controller('vault/credentials')
export class VaultController {
  constructor(private vault: VaultService) {}

  @Post(':serviceId/reauth')
  reauth(@CurrentUser() user: User, @Param('serviceId') serviceId: string, @Body() dto: ReauthDto) {
    return this.vault.reauth(user, serviceId, dto.adPassword);
  }
}
