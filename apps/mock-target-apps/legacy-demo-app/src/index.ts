import dotenv from 'dotenv';
import express from 'express';
import session from 'express-session';

dotenv.config();

const PORT = Number(process.env.PORT ?? 4003);
const APP_NAME = process.env.APP_NAME ?? 'Legacy HR App';
const WEB_BASE_URL = process.env.WEB_BASE_URL ?? 'http://localhost:5173';
const EXPECTED_USER = process.env.LEGACY_EXPECTED_USERNAME ?? 'hruser';
const EXPECTED_PASS = process.env.LEGACY_EXPECTED_PASSWORD ?? 'hr-pw-123';

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(session({ secret: process.env.SESSION_SECRET ?? 'dev', resave: false, saveUninitialized: false }));

const page = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><title>${APP_NAME}</title></head><body>${body}</body></html>`;

app.get('/login', (_req, res) => {
  res.type('html').send(
    page(
      `<h1>${APP_NAME} — sign in</h1><form method="post" action="/login">` +
        `<label>Username <input name="username"></label><br>` +
        `<label>Password <input name="password" type="password"></label><br>` +
        `<button type="submit">Sign in</button></form>`,
    ),
  );
});

app.post('/login', (req, res) => {
  const { username, password, failureRedirect } = req.body as Record<string, string>;
  if (username === EXPECTED_USER && password === EXPECTED_PASS) {
    (req.session as any).user = username;
    res.type('html').send(page(`<h1>${APP_NAME}</h1><p>You're signed in as ${username}. No second login prompt.</p>`));
    return;
  }
  // Failed native login → hand control back to the portal's FR-17 recovery flow, but only to a
  // trusted portal URL (guards against an open redirect if this field were ever attacker-set).
  if (failureRedirect && failureRedirect.startsWith(WEB_BASE_URL)) {
    res.redirect(failureRedirect);
    return;
  }
  res.status(400).type('html').send(page(`<h1>${APP_NAME}</h1><p>Sign-in failed.</p>`));
});

app.get('/', (req, res) => {
  const user = (req.session as any).user;
  if (!user) return res.redirect('/login');
  res.type('html').send(page(`<h1>${APP_NAME}</h1><p>Signed in as ${user}</p>`));
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`${APP_NAME} listening on ${PORT}`);
});
