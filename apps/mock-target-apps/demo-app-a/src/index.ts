import dotenv from 'dotenv';
import express from 'express';
import session from 'express-session';
import { Issuer, generators } from 'openid-client';

dotenv.config();

const PORT = Number(process.env.PORT ?? 4001);
const APP_NAME = process.env.APP_NAME ?? 'Demo App A';

async function main() {
  const issuer = await Issuer.discover(process.env.OIDC_ISSUER_URL!);
  const client = new issuer.Client({
    client_id: process.env.CLIENT_ID!,
    client_secret: process.env.CLIENT_SECRET!,
    redirect_uris: [process.env.REDIRECT_URI!],
    response_types: ['code'],
  });

  const app = express();
  app.use(session({ secret: process.env.SESSION_SECRET!, resave: false, saveUninitialized: false }));

  app.get('/login', (req, res) => {
    const state = generators.state();
    const codeVerifier = generators.codeVerifier();
    (req.session as any).oidcState = state;
    (req.session as any).oidcCodeVerifier = codeVerifier;
    res.redirect(
      client.authorizationUrl({
        scope: 'openid email profile',
        state,
        code_challenge: generators.codeChallenge(codeVerifier),
        code_challenge_method: 'S256',
      }),
    );
  });

  app.get('/callback', async (req, res, next) => {
    try {
      const params = client.callbackParams(req);
      const expectedState = (req.session as any).oidcState;
      const codeVerifier = (req.session as any).oidcCodeVerifier;
      const tokenSet = await client.callback(process.env.REDIRECT_URI!, params, { state: expectedState, code_verifier: codeVerifier });
      const userinfo = await client.userinfo(tokenSet);
      (req.session as any).user = userinfo;
      res.type('html').send(
        `<!doctype html><html><body><h1>${APP_NAME}</h1><p>You're logged in as ${userinfo.email} (${userinfo.department}/${userinfo.role}) — no second login prompt.</p></body></html>`,
      );
    } catch (err) {
      next(err);
    }
  });

  app.get('/', (req, res) => {
    const user = (req.session as any).user;
    if (!user) return res.redirect('/login');
    res.type('html').send(`<!doctype html><html><body><h1>${APP_NAME}</h1><p>Logged in as ${user.email}</p></body></html>`);
  });

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`${APP_NAME} listening on ${PORT}`);
  });
}

main();
