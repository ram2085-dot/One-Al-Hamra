import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { verifyPassword } from './password-hash';

@Injectable()
export class AdReauthService {
  constructor(private prisma: PrismaService) {}

  /** Mock AD adapter: the real one would bind against LDAP. Same signature either way. */
  async verify(adUsername: string, password: string): Promise<boolean> {
    const account = await this.prisma.adAccount.findUnique({ where: { adUsername } });
    if (!account) return false;
    return verifyPassword(password, account.passwordHash);
  }
}
