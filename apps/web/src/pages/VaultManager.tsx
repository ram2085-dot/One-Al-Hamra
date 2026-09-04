import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { apiClient, ApiError } from '../api/client';
import { ReauthModal } from '../components/ReauthModal';
import { strings } from '../strings';

interface CredentialItem {
  id: string;
  label: string | null;
  username: string;
  isDefault: boolean;
  lastRotatedAt: string;
  passwordExpiresAt: string | null;
}

type AddBody = { label?: string; username: string; password: string; passwordExpiresAt?: string };

type PendingAction =
  | { kind: 'add'; body: AddBody }
  | { kind: 'edit'; credentialId: string; body: Record<string, string> }
  | { kind: 'delete'; credentialId: string }
  | { kind: 'reveal'; credentialId: string };

const EXPIRY_WARN_DAYS = 14;

export function VaultManager() {
  const { id: serviceId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<CredentialItem[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, { username: string; password: string }>>({});
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editing, setEditing] = useState<CredentialItem | null>(null);
  const [launchFailed, setLaunchFailed] = useState(searchParams.get('credentialLaunchFailed') === '1');

  const refetch = useCallback(() => {
    setLoadFailed(false);
    apiClient
      .get<CredentialItem[]>(`/vault/credentials/${serviceId}`)
      .then(setItems)
      .catch(() => setLoadFailed(true));
  }, [serviceId]);

  useEffect(refetch, [refetch]);

  function dismissBanner() {
    setLaunchFailed(false);
    searchParams.delete('credentialLaunchFailed');
    setSearchParams(searchParams, { replace: true });
  }

  async function runLaunch(credentialId?: string) {
    setInlineError(null);
    try {
      const { injectUrl } = await apiClient.post<{ injectUrl: string }>(
        `/credential-launch/${serviceId}`,
        credentialId ? { credentialId } : undefined,
      );
      window.location.href = injectUrl;
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setInlineError(strings.vaultNoCredentialsHint);
      } else {
        setInlineError(err instanceof ApiError ? err.message : strings.reauthGenericError);
      }
    }
  }

  async function runPending(reauthToken: string) {
    const headers = { 'X-Reauth-Token': reauthToken };
    const action = pending;
    if (!action) return;
    setInlineError(null);
    try {
      if (action.kind === 'add') {
        await apiClient.post(`/vault/credentials/${serviceId}`, action.body, headers);
      } else if (action.kind === 'edit') {
        await apiClient.patch(`/vault/credentials/${serviceId}/${action.credentialId}`, action.body, headers);
      } else if (action.kind === 'delete') {
        await apiClient.delete(`/vault/credentials/${serviceId}/${action.credentialId}`, headers);
      } else if (action.kind === 'reveal') {
        const secret = await apiClient.get<{ username: string; password: string }>(
          `/vault/credentials/${serviceId}/${action.credentialId}/reveal`,
          headers,
        );
        setRevealed((r) => ({ ...r, [action.credentialId]: secret }));
      }
      if (action.kind !== 'reveal') {
        setShowAddForm(false);
        setEditing(null);
        refetch();
      }
    } catch (err) {
      setInlineError(err instanceof ApiError ? err.message : strings.reauthGenericError);
    } finally {
      setPending(null);
    }
  }

  async function setDefault(credentialId: string) {
    setInlineError(null);
    try {
      await apiClient.patch(`/vault/credentials/${serviceId}/${credentialId}/default`, undefined);
      refetch();
    } catch (err) {
      setInlineError(err instanceof ApiError ? err.message : strings.reauthGenericError);
    }
  }

  function hideRevealed(credentialId: string) {
    setRevealed((r) => {
      const next = { ...r };
      delete next[credentialId];
      return next;
    });
  }

  const nonDefault = useMemo(() => (items ?? []).filter((c) => !c.isDefault), [items]);
  const expirySoon = (items ?? []).find(
    (c) =>
      c.passwordExpiresAt &&
      new Date(c.passwordExpiresAt).getTime() - Date.now() < EXPIRY_WARN_DAYS * 86_400_000,
  );

  if (loadFailed) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p role="alert">{strings.loadErrorTitle}</p>
      </main>
    );
  }
  if (items === null) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p role="status">{strings.loadingLabel}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="font-heading text-2xl font-bold text-ink">{strings.vaultTitle}</h1>

      {launchFailed && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {strings.vaultLaunchFailedBanner}{' '}
          <button type="button" onClick={dismissBanner} className="underline">
            {strings.hideButton}
          </button>
        </p>
      )}

      {expirySoon && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          {strings.vaultExpiryWarningPrefix}{' '}
          {new Date(expirySoon.passwordExpiresAt!).toLocaleDateString()}.
        </p>
      )}

      {inlineError && (
        <p role="alert" className="text-sm text-red-600">
          {inlineError}
        </p>
      )}

      {items.length === 0 ? (
        <section>
          <h2 className="font-heading font-semibold text-ink">{strings.vaultNoCredentialsTitle}</h2>
          <p className="text-sm text-gray-600">{strings.vaultNoCredentialsHint}</p>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setShowAddForm(true);
            }}
            className="mt-3 rounded bg-ink px-3 py-1.5 text-sm text-white"
          >
            {strings.vaultAddButton}
          </button>
        </section>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => runLaunch()}
              className="rounded bg-ink px-4 py-2 text-sm text-white"
            >
              {strings.vaultLaunchButton}
            </button>
            {nonDefault.length > 0 && (
              <label className="text-sm">
                {strings.vaultLaunchWithLabel}{' '}
                <select
                  defaultValue=""
                  onChange={(e) => e.target.value && runLaunch(e.target.value)}
                  className="rounded border border-line p-1"
                >
                  <option value="" disabled>
                    —
                  </option>
                  {nonDefault.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label || c.username}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="py-2">{strings.vaultColLabel}</th>
                <th>{strings.vaultColUsername}</th>
                <th>{strings.vaultColRotated}</th>
                <th>{strings.actionsLabel}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-b border-line/50">
                  <td className="py-2">
                    {c.label || '—'}{' '}
                    {c.isDefault && (
                      <span className="ml-1 rounded bg-accent/10 px-1 text-xs text-accent">
                        {strings.vaultDefaultBadge}
                      </span>
                    )}
                  </td>
                  <td>
                    {revealed[c.id] ? (
                      <span>
                        {revealed[c.id].username} / <code>{revealed[c.id].password}</code>{' '}
                        <button
                          type="button"
                          onClick={() => hideRevealed(c.id)}
                          className="underline"
                        >
                          {strings.vaultHideButton}
                        </button>
                      </span>
                    ) : (
                      c.username
                    )}
                  </td>
                  <td>{new Date(c.lastRotatedAt).toLocaleDateString()}</td>
                  <td className="space-x-2">
                    <button
                      type="button"
                      onClick={() => setPending({ kind: 'reveal', credentialId: c.id })}
                      className="underline"
                    >
                      {strings.vaultRevealButton}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddForm(false);
                        setEditing(c);
                      }}
                      className="underline"
                    >
                      {strings.vaultEditButton}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPending({ kind: 'delete', credentialId: c.id })}
                      className="text-red-600 underline"
                    >
                      {strings.vaultDeleteButton}
                    </button>
                    {!c.isDefault && (
                      <button
                        type="button"
                        onClick={() => setDefault(c.id)}
                        className="underline"
                      >
                        {strings.vaultSetDefaultButton}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setShowAddForm(true);
            }}
            className="rounded border border-line px-3 py-1.5 text-sm"
          >
            {strings.vaultAddButton}
          </button>
        </>
      )}

      {showAddForm && (
        <AddCredentialForm
          onCancel={() => setShowAddForm(false)}
          onSubmit={(body) => setPending({ kind: 'add', body })}
        />
      )}

      {editing && (
        <EditCredentialForm
          credential={editing}
          onCancel={() => setEditing(null)}
          onSubmit={(body) => setPending({ kind: 'edit', credentialId: editing.id, body })}
        />
      )}

      <ReauthModal
        serviceId={serviceId}
        open={pending !== null}
        onClose={() => setPending(null)}
        onSuccess={runPending}
      />
    </main>
  );
}

function AddCredentialForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (body: AddBody) => void;
}) {
  const [label, setLabel] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [expiry, setExpiry] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          label: label || undefined,
          username,
          password,
          passwordExpiresAt: expiry ? new Date(expiry).toISOString() : undefined,
        });
      }}
      className="space-y-2 rounded border border-line p-4"
    >
      <label className="block text-sm">
        {strings.vaultLabelField}
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="mt-1 w-full rounded border border-line p-2"
        />
      </label>
      <label className="block text-sm">
        {strings.vaultUsernameField}
        <input
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mt-1 w-full rounded border border-line p-2"
        />
      </label>
      <label className="block text-sm">
        {strings.vaultPasswordField}
        <input
          required
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded border border-line p-2"
        />
      </label>
      <label className="block text-sm">
        {strings.vaultExpiryField}
        <input
          type="date"
          value={expiry}
          onChange={(e) => setExpiry(e.target.value)}
          className="mt-1 rounded border border-line p-2"
        />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm">
          {strings.vaultCancelButton}
        </button>
        <button type="submit" className="rounded bg-ink px-3 py-1.5 text-sm text-white">
          {strings.vaultSaveButton}
        </button>
      </div>
    </form>
  );
}

function toDateInputValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function EditCredentialForm({
  credential,
  onCancel,
  onSubmit,
}: {
  credential: CredentialItem;
  onCancel: () => void;
  onSubmit: (body: Record<string, string>) => void;
}) {
  const [label, setLabel] = useState(credential.label ?? '');
  const [username, setUsername] = useState(credential.username);
  const [password, setPassword] = useState('');
  const [expiry, setExpiry] = useState(toDateInputValue(credential.passwordExpiresAt));

  // Send only the fields the user actually changed: an empty password means "keep the current one",
  // and an unchanged expiry date is omitted so it never burns a re-auth on a no-op PATCH.
  const changed: Record<string, string> = {};
  if (label !== (credential.label ?? '')) changed.label = label;
  if (username !== credential.username) changed.username = username;
  if (password) changed.password = password;
  if (expiry) {
    const iso = new Date(expiry).toISOString();
    const current = credential.passwordExpiresAt;
    if (!current || new Date(current).getTime() !== new Date(iso).getTime()) {
      changed.passwordExpiresAt = iso;
    }
  }
  const nothingChanged = Object.keys(changed).length === 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (nothingChanged) return;
        onSubmit(changed);
      }}
      className="space-y-2 rounded border border-line p-4"
    >
      <label className="block text-sm">
        {strings.vaultLabelField}
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="mt-1 w-full rounded border border-line p-2"
        />
      </label>
      <label className="block text-sm">
        {strings.vaultUsernameField}
        <input
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mt-1 w-full rounded border border-line p-2"
        />
      </label>
      <label className="block text-sm">
        {strings.vaultPasswordField}
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded border border-line p-2"
        />
        <span className="mt-1 block text-xs text-gray-500">{strings.vaultPasswordKeepHint}</span>
      </label>
      <label className="block text-sm">
        {strings.vaultExpiryField}
        <input
          type="date"
          value={expiry}
          onChange={(e) => setExpiry(e.target.value)}
          className="mt-1 rounded border border-line p-2"
        />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm">
          {strings.vaultCancelButton}
        </button>
        <button
          type="submit"
          disabled={nothingChanged}
          className="rounded bg-ink px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {strings.vaultSaveButton}
        </button>
      </div>
    </form>
  );
}
