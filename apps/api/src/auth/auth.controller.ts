import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { User } from '@prisma/client';
import { Public } from '../common/guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';

/** The only user fields the client is ever given — no adUsername, no internal timestamps. */
function safeUser(user: User) {
  return { id: user.id, email: user.email, displayName: user.displayName, department: user.department, role: user.role };
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body('email') email: string, @Res({ passthrough: true }) res: Response) {
    const { token, user } = await this.authService.login(email);
    res.cookie('session', token, { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 });
    return safeUser(user);
  }

  /**
   * Session restore on page load. Deliberately NOT @Public(): the global AuthGuard rejects a
   * missing/expired/invalid cookie with a 401, which is exactly what the client treats as
   * "logged out" — no extra logic needed here.
   */
  @Get('me')
  async me(@CurrentUser() user: User) {
    return safeUser(user);
  }

  @Public()
  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('session');
    return { ok: true };
  }
}
