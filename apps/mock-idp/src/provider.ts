/// <reference path="./oidc-provider.d.ts" />
import Provider, { type Configuration, type FindAccount } from 'oidc-provider';

const PORTAL_REDIRECT = process.env.PORTAL_REDIRECT_URI ?? 'http://localhost:3001/auth/oidc/callback';
const DEMO_APP_A_REDIRECT = process.env.DEMO_APP_A_REDIRECT_URI ?? 'http://localhost:4001/callback';
const DEMO_APP_B_REDIRECT = process.env.DEMO_APP_B_REDIRECT_URI ?? 'http://localhost:4002/callback';

/**
 * Three statically-registered clients, matching the "2 fixed demo apps" scope decision
 * (see design spec §9) — no dynamic client registration for a prototype mock IdP.
 */
const clients: Configuration['clients'] = [
  {
    client_id: 'portal',
    client_secret: 'portal-dev-secret',
    redirect_uris: [PORTAL_REDIRECT],
    response_types: ['code'],
    grant_types: ['authorization_code'],
    token_endpoint_auth_method: 'client_secret_basic',
  },
  {
    client_id: 'demo-app-a',
    client_secret: 'demo-app-a-secret',
    redirect_uris: [DEMO_APP_A_REDIRECT],
    response_types: ['code'],
    grant_types: ['authorization_code'],
    token_endpoint_auth_method: 'client_secret_basic',
  },
  {
    client_id: 'demo-app-b',
    client_secret: 'demo-app-b-secret',
    redirect_uris: [DEMO_APP_B_REDIRECT],
    response_types: ['code'],
    grant_types: ['authorization_code'],
    token_endpoint_auth_method: 'client_secret_basic',
  },
];

export function buildProvider(issuer: string, findAccount: FindAccount): Provider {
  return new Provider(issuer, {
    clients,
    claims: { openid: ['sub'], email: ['email'], profile: ['department', 'role'] },
    findAccount,
    features: { devInteractions: { enabled: false } },
    interactions: { url: (_ctx, interaction) => `/interaction/${interaction.uid}` },
    cookies: { keys: [process.env.COOKIE_SECRET ?? 'dev-only-mock-idp-cookie-secret'] },
  });
}
