import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

afterAll(() => prisma.$disconnect());

describe('Phase 3 vault schema', () => {
  it('can round-trip a Credential row in the vault schema', async () => {
    const row = await prisma.credential.create({
      data: {
        userId: 'test-user-schema',
        serviceId: 'test-service-schema',
        label: 'unit',
        encUsername: 'enc-u',
        encPassword: 'enc-p',
        isDefault: true,
      },
    });
    expect(row.id).toEqual(expect.any(String));
    expect(row.lastRotatedAt).toBeInstanceOf(Date);
    expect(row.passwordExpiresAt).toBeNull();
    await prisma.credential.delete({ where: { id: row.id } });
  });

  it('enforces one CredentialVaultLockout per user+service composite key', async () => {
    await prisma.credentialVaultLockout.create({
      data: { userId: 'u-lock', serviceId: 's-lock', failedAttempts: 1 },
    });
    await expect(
      prisma.credentialVaultLockout.create({
        data: { userId: 'u-lock', serviceId: 's-lock', failedAttempts: 2 },
      }),
    ).rejects.toThrow();
    await prisma.credentialVaultLockout.delete({
      where: { userId_serviceId: { userId: 'u-lock', serviceId: 's-lock' } },
    });
  });
});
