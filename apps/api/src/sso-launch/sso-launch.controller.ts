import { Controller, Get, Param } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SsoLaunchService } from './sso-launch.service';

@Controller('sso-launch')
export class SsoLaunchController {
  constructor(private ssoLaunchService: SsoLaunchService) {}

  @Get(':serviceId')
  async launch(@CurrentUser() user: User, @Param('serviceId') serviceId: string) {
    return this.ssoLaunchService.resolve(user, serviceId);
  }
}
