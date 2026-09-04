import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { User } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/guards/auth.guard';
import { CredentialLaunchService } from './credential-launch.service';
import { LaunchTokenStore } from './launch-token.store';

/** Escapes the five characters that could break out of a double-quoted HTML attribute or
 *  inject markup, so a credential containing `"` or `<` stays inert inside the form. */
const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

@Controller('credential-launch')
export class CredentialLaunchController {
  constructor(
    private launch: CredentialLaunchService,
    private tokens: LaunchTokenStore,
    private config: ConfigService,
  ) {}

  @Post(':serviceId')
  resolve(
    @CurrentUser() user: User,
    @Param('serviceId') serviceId: string,
    @Body('credentialId') credentialId: string | undefined,
  ) {
    return this.launch.resolve(user, serviceId, credentialId);
  }

  @Public()
  @Get('inject/:token')
  inject(@Param('token') token: string, @Res() res: Response) {
    const payload = this.tokens.consume(token);
    res.setHeader('Cache-Control', 'no-store');
    res.type('html');
    if (!payload) {
      res.status(410).send(
        `<!doctype html><html><head><meta charset="utf-8"><title>Launch link expired</title></head><body>` +
          `<h1>This launch link has expired.</h1>` +
          `<p>Go back to the portal and click Launch again. If it keeps happening, contact the help desk at helpdesk@launchpad.local.</p>` +
          `</body></html>`,
      );
      return;
    }
    const action = this.config.get<string>('LEGACY_APP_LOGIN_URL')!;
    res.status(200).send(
      `<!doctype html><html><head><meta charset="utf-8"><title>Signing you in…</title></head>` +
        `<body onload="document.forms[0].submit()">` +
        `<p>Signing you in…</p>` +
        `<form method="post" action="${escapeHtml(action)}">` +
        `<input type="hidden" name="username" value="${escapeHtml(payload.username)}">` +
        `<input type="hidden" name="password" value="${escapeHtml(payload.password)}">` +
        `<input type="hidden" name="failureRedirect" value="${escapeHtml(payload.failureRedirect)}">` +
        `<noscript><button type="submit">Continue</button></noscript>` +
        `</form></body></html>`,
    );
  }
}
