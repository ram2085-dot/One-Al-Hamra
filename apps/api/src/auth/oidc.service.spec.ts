import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OidcService } from './oidc.service';

const mockClient = {
  authorizationUrl: jest.fn(),
  callbackParams: jest.fn(),
  callback: jest.fn(),
  userinfo: jest.fn(),
};

jest.mock('openid-client', () => ({
  Issuer: { discover: jest.fn(() => Promise.resolve({ Client: jest.fn(() => mockClient) })) },
  generators: {
    state: () => 'mock-state',
    codeVerifier: () => 'mock-code-verifier',
    codeChallenge: (verifier: string) => `mock-challenge-for-${verifier}`,
  },
}));

describe('OidcService', () => {
  let service: OidcService;
  const config = {
    get: (key: string) =>
      ({
        OIDC_ISSUER_URL: 'http://localhost:4000',
        OIDC_CLIENT_ID: 'portal',
        OIDC_CLIENT_SECRET: 'portal-dev-secret',
        OIDC_REDIRECT_URI: 'http://localhost:3001/auth/oidc/callback',
      }[key]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [OidcService, { provide: ConfigService, useValue: config }],
    }).compile();
    service = moduleRef.get(OidcService);
  });

  it('builds an authorization URL requesting openid+email scope with a PKCE challenge, and returns the matching verifier and state', async () => {
    mockClient.authorizationUrl.mockReturnValue('http://localhost:4000/auth?mock=1');
    const { url, codeVerifier, state } = await service.getAuthorizationUrl();
    expect(url).toBe('http://localhost:4000/auth?mock=1');
    expect(codeVerifier).toBe('mock-code-verifier');
    expect(state).toBe('mock-state');
    expect(mockClient.authorizationUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'openid email',
        state: 'mock-state',
        code_challenge: 'mock-challenge-for-mock-code-verifier',
        code_challenge_method: 'S256',
      }),
    );
  });

  it('exchanges the callback, verifying PKCE with the caller-supplied verifier, and returns the email from userinfo', async () => {
    const fakeReq = { url: '/auth/oidc/callback?code=abc' } as any;
    mockClient.callbackParams.mockReturnValue({ code: 'abc' });
    mockClient.callback.mockResolvedValue({ access_token: 'tok' });
    mockClient.userinfo.mockResolvedValue({ email: 'admin@launchpad.local' });
    const result = await service.handleCallback(fakeReq, 'mock-code-verifier', 'mock-state');
    expect(result).toEqual({ email: 'admin@launchpad.local' });
    expect(mockClient.callbackParams).toHaveBeenCalledWith(fakeReq);
    expect(mockClient.callback).toHaveBeenCalledWith(
      'http://localhost:3001/auth/oidc/callback',
      { code: 'abc' },
      { code_verifier: 'mock-code-verifier', state: 'mock-state' },
    );
  });
});
