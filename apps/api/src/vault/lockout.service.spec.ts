import { Test } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { LockoutService } from './lockout.service';
import { PrismaService } from '../common/prisma.service';

describe('LockoutService', () => {
  let service: LockoutService;
  const prisma = { credentialVaultLockout: { findUnique: jest.fn(), upsert: jest.fn(), delete: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [LockoutService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(LockoutService);
  });

  it('assertNotLocked passes when there is no lockout row', async () => {
    prisma.credentialVaultLockout.findUnique.mockResolvedValue(null);
    await expect(service.assertNotLocked('u1', 's1')).resolves.toBeUndefined();
  });

  it('assertNotLocked throws 423 with retryAfterSeconds while lockedUntil is in the future', async () => {
    prisma.credentialVaultLockout.findUnique.mockResolvedValue({
      userId: 'u1', serviceId: 's1', failedAttempts: 5, lockedUntil: new Date(Date.now() + 60_000),
    });
    // NestJS 10.4.x HttpException keeps `status` private (getStatus()), so assert via the accessors.
    expect.assertions(4);
    try {
      await service.assertNotLocked('u1', 's1');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const e = err as HttpException;
      expect(e.getStatus()).toBe(423);
      const body = e.getResponse() as { retryAfterSeconds: number };
      expect(typeof body.retryAfterSeconds).toBe('number');
      expect(body.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it('assertNotLocked clears a stale row once lockedUntil is in the past, then resolves', async () => {
    prisma.credentialVaultLockout.findUnique.mockResolvedValue({
      userId: 'u1', serviceId: 's1', failedAttempts: 5, lockedUntil: new Date(Date.now() - 60_000),
    });
    prisma.credentialVaultLockout.delete.mockResolvedValue({});
    await expect(service.assertNotLocked('u1', 's1')).resolves.toBeUndefined();
    expect(prisma.credentialVaultLockout.delete).toHaveBeenCalledWith({
      where: { userId_serviceId: { userId: 'u1', serviceId: 's1' } },
    });
  });

  it('recordFailure sets lockedUntil and raises a 423 once failedAttempts reaches 5', async () => {
    prisma.credentialVaultLockout.findUnique.mockResolvedValue({ userId: 'u1', serviceId: 's1', failedAttempts: 4, lockedUntil: null });
    // The 5th failure locks the account, so recordFailure itself raises the 423.
    expect.assertions(4);
    try {
      await service.recordFailure('u1', 's1');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(423);
    }
    const arg = prisma.credentialVaultLockout.upsert.mock.calls[0][0];
    expect(arg.update.failedAttempts).toBe(5);
    expect(arg.update.lockedUntil).toBeInstanceOf(Date);
  });

  it('recordFailure below the threshold just increments, without throwing', async () => {
    prisma.credentialVaultLockout.findUnique.mockResolvedValue({ userId: 'u1', serviceId: 's1', failedAttempts: 2, lockedUntil: null });
    await expect(service.recordFailure('u1', 's1')).resolves.toBeUndefined();
    const arg = prisma.credentialVaultLockout.upsert.mock.calls[0][0];
    expect(arg.update.failedAttempts).toBe(3);
    expect(arg.update.lockedUntil).toBeNull();
  });

  it('reset deletes the lockout row (ignoring a missing row)', async () => {
    prisma.credentialVaultLockout.delete.mockRejectedValue(Object.assign(new Error('not found'), { code: 'P2025' }));
    await expect(service.reset('u1', 's1')).resolves.toBeUndefined();
  });
});
