import { Body, Controller, Param, Post } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CredentialLaunchService } from './credential-launch.service';

@Controller('credential-launch')
export class CredentialLaunchController {
  constructor(private launch: CredentialLaunchService) {}

  @Post(':serviceId')
  resolve(
    @CurrentUser() user: User,
    @Param('serviceId') serviceId: string,
    @Body('credentialId') credentialId: string | undefined,
  ) {
    return this.launch.resolve(user, serviceId, credentialId);
  }
}
