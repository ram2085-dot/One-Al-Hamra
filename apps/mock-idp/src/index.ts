import dotenv from 'dotenv';

// Must run before importing `./users` (and `./provider`): both read process.env at module
// load time (e.g. `./users`'s pg Pool is constructed from DATABASE_URL as soon as it's
// required), and TS-compiled CommonJS `require()`s execute in source order, so dotenv.config()
// has to come before those imports textually, not just before the first process.env read.
dotenv.config();

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { buildProvider } from './provider';
import { listUsers, findUserById, type MockUser } from './users';

const PORT = Number(process.env.PORT ?? 4000);
const ISSUER = process.env.ISSUER ?? `http://localhost:${PORT}`;

const findAccount = async (_ctx: unknown, id: string) => {
  const user = await findUserById(id);
  if (!user) return undefined;
  return {
    accountId: id,
    claims: async () => ({ sub: id, email: user.email, department: user.department, role: user.role }),
  };
};

const oidc = buildProvider(ISSUER, findAccount);
const app = express();
app.use(express.urlencoded({ extended: false }));

// GET is only ever hit for the `login` prompt — a session that already exists at this IdP
// completes the authorization request without ever reaching an interaction route at all,
// which is exactly the mechanism that makes a later SSO *launch* silent (design spec §5 step 3).
app.get('/interaction/:uid', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { uid, prompt, session, params } = await oidc.interactionDetails(req, res);
    if (prompt.name === 'consent') {
      // oidc-provider requires an explicit consent grant before it will issue tokens for a
      // client/scope combination it hasn't seen granted before (confirmed against the
      // installed v8.8.1: the login above resumes into a *second* interaction whose prompt.name
      // is "consent"). This is a mock IdP with 3 statically pre-registered, trusted clients —
      // there's no real end user to prompt, so we auto-grant the requested scope, mirroring
      // oidc-provider's own documented pattern for auto-granting consent.
      const grant = new oidc.Grant({ accountId: session!.accountId!, clientId: params.client_id as string });
      grant.addOIDCScope(params.scope as string);
      const grantId = await grant.save();
      await oidc.interactionFinished(req, res, { consent: { grantId } }, { mergeWithLastSubmission: true });
      return;
    }
    if (prompt.name !== 'login') {
      return next(new Error(`mock-idp: unsupported prompt "${prompt.name}"`));
    }
    const users = await listUsers();
    res.type('html').send(renderPicker(uid, users));
  } catch (err) {
    next(err);
  }
});

app.post('/interaction/:uid/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = { login: { accountId: req.body.accountId } };
    await oidc.interactionFinished(req, res, result, { mergeWithLastSubmission: false });
  } catch (err) {
    next(err);
  }
});

app.use(oidc.callback());

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`mock-idp listening on ${PORT}, issuer ${ISSUER}`);
});

function renderPicker(uid: string, users: MockUser[]): string {
  const rows = users
    .map(
      (u) => `
    <form method="post" action="/interaction/${uid}/login" style="margin-bottom: 0.5rem;">
      <input type="hidden" name="accountId" value="${u.id}" />
      <button type="submit">${u.displayName} (${u.email})</button>
    </form>`,
    )
    .join('');
  return `<!doctype html><html><body><h1>Mock IdP — choose a user</h1>${rows}</body></html>`;
}
