import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Issuer, generators, type Client } from 'openid-client';

@Injectable()
export class OidcService {
  private clientPromise: Promise<Client> | null = null;

  constructor(private config: ConfigService) {}

  private async getClient(): Promise<Client> {
    if (!this.clientPromise) {
      this.clientPromise = Issuer.discover(this.config.get<string>('OIDC_ISSUER_URL')!).then(
        (issuer) =>
          new issuer.Client({
            client_id: this.config.get<string>('OIDC_CLIENT_ID')!,
            client_secret: this.config.get<string>('OIDC_CLIENT_SECRET')!,
            redirect_uris: [this.config.get<string>('OIDC_REDIRECT_URI')!],
            response_types: ['code'],
          }),
      );
    }
    return this.clientPromise;
  }

  async getAuthorizationUrl(): Promise<{ url: string; codeVerifier: string; state: string }> {
    const client = await this.getClient();
    const codeVerifier = generators.codeVerifier();
    const state = generators.state();
    const url = client.authorizationUrl({
      scope: 'openid email',
      state,
      code_challenge: generators.codeChallenge(codeVerifier),
      code_challenge_method: 'S256',
    });
    return { url, codeVerifier, state };
  }

  async handleCallback(callbackParams: Record<string, string>, codeVerifier: string, state: string): Promise<{ email: string }> {
    const client = await this.getClient();
    const params = client.callbackParams({ query: callbackParams } as any);
    const tokenSet = await client.callback(this.config.get<string>('OIDC_REDIRECT_URI')!, params, { code_verifier: codeVerifier, state });
    const userinfo = await client.userinfo(tokenSet);
    return { email: userinfo.email as string };
  }
}
