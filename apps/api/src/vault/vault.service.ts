import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CatalogService } from '../catalog/catalog.service';
import { AdReauthService } from './ad-reauth/ad-reauth.service';
import { LockoutService } from './lockout.service';
import { ReauthTokenStore } from './reauth-token.store';

@Injectable()
export class VaultService {
  constructor(
    private catalog: CatalogService,
    private adReauth: AdReauthService,
    private lockout: LockoutService,
    private reauthTokens: ReauthTokenStore,
  ) {}

  async reauth(user: User, serviceId: string, adPassword: string): Promise<{ reauthToken: string }> {
    await this.catalog.assertEntitled(user, serviceId); // 404 if not entitled — existence must not leak
    await this.lockout.assertNotLocked(user.id, serviceId);

    const ok = await this.adReauth.verify(user.adUsername, adPassword);
    if (!ok) {
      await this.lockout.recordFailure(user.id, serviceId); // may itself throw 423 on the 5th failure
      throw new UnauthorizedException("That password wasn't recognized.");
    }

    await this.lockout.reset(user.id, serviceId);
    return { reauthToken: this.reauthTokens.issue({ userId: user.id, serviceId }) };
  }
}
