import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { strings } from '../strings';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login(email);
    } catch {
      setError('Login failed. Check your email and try again.');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink">
      <form onSubmit={onSubmit} className="w-80 space-y-4 rounded-lg bg-card p-8 shadow-lg" aria-label={strings.loginPrompt}>
        <div className="mb-2 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded border-2 border-ink">
            <span aria-hidden className="text-xl text-ink">▲</span>
          </div>
          <h1 className="font-heading text-lg font-bold uppercase tracking-wide text-ink">{strings.appName}</h1>
        </div>
        <label htmlFor="email" className="block text-sm font-medium text-ink">Email</label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border border-line px-3 py-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
        />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="w-full rounded bg-accent px-3 py-2 font-heading text-sm font-semibold uppercase tracking-wide text-white hover:bg-accent-dark focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2">
          {strings.loginButton}
        </button>
      </form>
    </main>
  );
}
