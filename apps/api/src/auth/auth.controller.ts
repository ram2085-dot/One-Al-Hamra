import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { User } from '@prisma/client';
import { Public } from '../common/guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { OidcService } from './oidc.service';

/** The only user fields the client is ever given — no adUsername, no internal timestamps. */
function safeUser(user: User) {
  return { id: user.id, email: user.email, displayName: user.displayName, department: user.department, role: user.role };
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService, private oidcService: OidcService, private config: ConfigService) {}

  @Public()
  @Get('oidc/login')
  async oidcLogin(@Res() res: Response) {
    const { url, codeVerifier, state } = await this.oidcService.getAuthorizationUrl();
    // Short-lived, cleared on the very next request (the callback). httpOnly since these are
    // PKCE/CSRF secrets, not app state; separate from the `session` cookie because they exist for
    // seconds, not 8 hours. Task 3 confirmed the mock IdP requires PKCE, and openid-client v5
    // doesn't generate/persist PKCE or verify `state` on its own — these cookies are the RP-side
    // "session" between the login redirect and the callback that verifies both.
    const cookieOpts = { httpOnly: true, sameSite: 'lax' as const, maxAge: 5 * 60 * 1000 };
    res.cookie('oidc_verifier', codeVerifier, cookieOpts);
    res.cookie('oidc_state', state, cookieOpts);
    res.redirect(url);
  }

  @Public()
  @Get('oidc/callback')
  async oidcCallback(@Query() query: Record<string, string>, @Req() req: Request, @Res() res: Response) {
    const codeVerifier = req.cookies?.oidc_verifier;
    const state = req.cookies?.oidc_state;
    res.clearCookie('oidc_verifier');
    res.clearCookie('oidc_state');
    if (!codeVerifier || !state) {
      res.status(400).type('html').send(
        `<!doctype html><html><body><h1>We couldn't sign you in.</h1><p>Your login session expired before it completed. Try signing in again.</p></body></html>`,
      );
      return;
    }
    const { email } = await this.oidcService.handleCallback(query, codeVerifier, state);
    let token: string;
    try {
      ({ token } = await this.authService.login(email));
    } catch {
      // Every mock-idp account should always match a Phase 1 User by email — this only fires on
      // drift between the two seed sources, not as a normal user-facing case. Per design spec §8,
      // shown as a plain-language page (not raw JSON) with a help-desk route, same tone as the
      // frontend's ErrorState/EmptyState components.
      res.status(401).type('html').send(
        `<!doctype html><html><body><h1>We couldn't sign you in.</h1><p>No account matches ${email}. Contact the help desk at helpdesk@launchpad.local.</p></body></html>`,
      );
      return;
    }
    res.cookie('session', token, { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 });
    res.redirect(this.config.get<string>('WEB_BASE_URL')!);
  }

  /**
   * Test-only stand-in for a full browser OIDC round trip, which none of this backend's
   * in-process e2e tests (Test.createTestingModule, no real browser) can drive. Inert outside
   * NODE_ENV=production is never set in this dev/test environment. See the plan's "Deviation
   * from the design spec" note for why this exists instead of removing seeded login entirely.
   */
  @Public()
  @Post('dev-login')
  async devLogin(@Body('email') email: string, @Res({ passthrough: true }) res: Response) {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      res.status(404);
      return { message: 'Not found' };
    }
    const { token, user } = await this.authService.login(email);
    res.cookie('session', token, { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 });
    return safeUser(user);
  }

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
