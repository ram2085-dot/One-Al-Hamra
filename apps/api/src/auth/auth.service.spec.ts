import { Test } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../common/prisma.service';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';

describe('AuthService', () => {
  let service: AuthService;
  const mockUser = { id: 'u1', email: 'a@b.com', displayName: 'A B', department: 'IT', role: 'EMPLOYEE', adUsername: 'ab' };
  const prisma = { user: { findUnique: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: () => 'test-secret' } },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('logs in a known seeded user and returns a valid JWT', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser);
    const { token, user } = await service.login('a@b.com');
    expect(user).toEqual(mockUser);
    const decoded = jwt.verify(token, 'test-secret') as { sub: string };
    expect(decoded.sub).toBe('u1');
  });

  it('rejects login for an unknown email', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.login('nobody@b.com')).rejects.toThrow('Unknown user');
  });

  it('verifies a valid token and returns the user', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser);
    const { token } = await service.login('a@b.com');
    const user = await service.verify(token);
    expect(user.id).toBe('u1');
  });

  it('rejects an invalid token', async () => {
    await expect(service.verify('not-a-real-token')).rejects.toThrow();
  });
});
