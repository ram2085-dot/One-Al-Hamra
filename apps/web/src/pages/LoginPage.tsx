// apps/web/src/pages/LoginPage.tsx
import { strings } from '../strings';

const API_BASE_URL = 'http://localhost:3001';

export function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink">
      <div className="w-80 space-y-4 rounded-lg bg-card p-8 text-center shadow-lg">
        <div className="mb-2 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded border-2 border-ink">
            <span aria-hidden className="text-xl text-ink">▲</span>
          </div>
          <h1 className="font-heading text-lg font-bold uppercase tracking-wide text-ink">{strings.appName}</h1>
        </div>
        <a
          href={`${API_BASE_URL}/auth/oidc/login`}
          className="block w-full rounded bg-accent px-3 py-2 font-heading text-sm font-semibold uppercase tracking-wide text-white hover:bg-accent-dark focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
        >
          {strings.signInWithSsoButton}
        </a>
      </div>
    </main>
  );
}
