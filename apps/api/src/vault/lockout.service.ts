import { HttpException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60 * 1000;
// This @nestjs/common (10.4.22) HttpStatus enum has no LOCKED member, so use the literal.
const HTTP_LOCKED = 423;

@Injectable()
export class LockoutService {
  constructor(private prisma: PrismaService) {}

  private lockedError(retryAfterSeconds: number): HttpException {
    return new HttpException(
      {
        message: `Too many failed attempts. Try again in about ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
        retryAfterSeconds,
      },
      HTTP_LOCKED,
    );
  }

  async assertNotLocked(userId: string, serviceId: string): Promise<void> {
    const row = await this.prisma.credentialVaultLockout.findUnique({
      where: { userId_serviceId: { userId, serviceId } },
    });
    if (!row?.lockedUntil) return;
    if (row.lockedUntil.getTime() > Date.now()) {
      throw this.lockedError(Math.round((row.lockedUntil.getTime() - Date.now()) / 1000));
    }
    // Lock has expired: drop the stale row so the user gets a fresh set of attempts,
    // rather than re-locking on the next single failure ((5 ?? 0) + 1 >= 5).
    await this.reset(userId, serviceId);
  }

  async recordFailure(userId: string, serviceId: string): Promise<void> {
    const row = await this.prisma.credentialVaultLockout.findUnique({
      where: { userId_serviceId: { userId, serviceId } },
    });
    const failedAttempts = (row?.failedAttempts ?? 0) + 1;
    const lockedUntil = failedAttempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MS) : null;
    await this.prisma.credentialVaultLockout.upsert({
      where: { userId_serviceId: { userId, serviceId } },
      create: { userId, serviceId, failedAttempts, lockedUntil },
      update: { failedAttempts, lockedUntil },
    });
    if (lockedUntil) throw this.lockedError(Math.round(LOCK_MS / 1000));
  }

  async reset(userId: string, serviceId: string): Promise<void> {
    try {
      await this.prisma.credentialVaultLockout.delete({
        where: { userId_serviceId: { userId, serviceId } },
      });
    } catch (e: any) {
      if (e?.code !== 'P2025') throw e; // P2025 = row didn't exist, which is fine
    }
  }
}
