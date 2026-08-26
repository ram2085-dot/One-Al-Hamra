// `oidc-provider` (v8.8.1 as installed) ships no TypeScript declarations of its own
// (no `types`/`typings` field in package.json, no .d.ts files in the published `lib/`
// tree, and no `@types/oidc-provider` package exists on the registry). This is a
// deliberately minimal ambient declaration covering only the surface this app uses,
// so `strict` compilation succeeds without resorting to a blanket `any` import.
declare module 'oidc-provider' {
  export interface Account {
    accountId: string;
    claims: (use: string, scope: string, claims: unknown, rejected: string[]) => Promise<Record<string, unknown>> | Record<string, unknown>;
  }

  export type FindAccount = (ctx: unknown, sub: string) => Promise<Account | undefined> | Account | undefined;

  export interface ClientMetadata {
    client_id: string;
    client_secret?: string;
    redirect_uris?: string[];
    response_types?: string[];
    grant_types?: string[];
    token_endpoint_auth_method?: string;
    [key: string]: unknown;
  }

  export interface Configuration {
    clients?: ClientMetadata[];
    claims?: Record<string, string[]>;
    findAccount?: FindAccount;
    features?: Record<string, unknown>;
    interactions?: { url?: (ctx: unknown, interaction: { uid: string }) => string };
    cookies?: { keys?: string[] };
    [key: string]: unknown;
  }

  export interface Interaction {
    uid: string;
    prompt: { name: string; reasons?: string[]; details?: Record<string, unknown> };
    params: Record<string, unknown>;
    session?: { accountId?: string; uid?: string };
    lastSubmission?: Record<string, unknown>;
  }

  export interface GrantInstance {
    addOIDCScope: (scope: string) => void;
    save: () => Promise<string>;
  }

  export interface GrantConstructor {
    new (props: { accountId: string; clientId: string }): GrantInstance;
  }

  export default class Provider {
    constructor(issuer: string, configuration?: Configuration);
    readonly Grant: GrantConstructor;
    interactionDetails(req: unknown, res: unknown): Promise<Interaction>;
    interactionFinished(
      req: unknown,
      res: unknown,
      result: Record<string, unknown>,
      options?: { mergeWithLastSubmission?: boolean },
    ): Promise<void>;
    callback(): (req: unknown, res: unknown) => void;
    listen(port: number, callback?: () => void): unknown;
  }
}
