import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';
import { CatalogService } from '../catalog/catalog.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class SsoLaunchService {
  constructor(private catalogService: CatalogService, private auditService: AuditService, private config: ConfigService) {}

  async resolve(user: User, serviceId: string): Promise<{ redirectUrl: string }> {
    const service = await this.catalogService.assertEntitled(user, serviceId);
    const redirectUrl = this.resolveTargetUrl(service.ssoTargetApp);
    await this.auditService.record(user.id, 'SSO_LAUNCH', serviceId);
    return { redirectUrl };
  }

  private resolveTargetUrl(ssoTargetApp: string | null): string {
    if (ssoTargetApp === 'DEMO_APP_A') return this.config.get<string>('DEMO_APP_A_URL')!;
    if (ssoTargetApp === 'DEMO_APP_B') return this.config.get<string>('DEMO_APP_B_URL')!;
    throw new BadRequestException("This service isn't configured for SSO launch yet — contact the help desk.");
  }
}
