import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import { PrismaService } from '../common/prisma.service';
import type { User } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private config: ConfigService) {}

  async login(email: string): Promise<{ token: string; user: User }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Unknown user');
    }
    const token = jwt.sign({ sub: user.id }, this.config.get<string>('JWT_SECRET')!, { expiresIn: '8h' });
    return { token, user };
  }

  async verify(token: string): Promise<User> {
    let payload: { sub: string };
    try {
      payload = jwt.verify(token, this.config.get<string>('JWT_SECRET')!) as { sub: string };
    } catch {
      throw new UnauthorizedException('Invalid session');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException('Invalid session');
    }
    return user;
  }
}
