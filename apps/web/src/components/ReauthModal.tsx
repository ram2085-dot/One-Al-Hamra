import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { apiClient, ApiError } from '../api/client';
import { strings } from '../strings';

interface ReauthModalProps {
  serviceId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: (reauthToken: string) => void;
}

export function ReauthModal({ serviceId, open, onClose, onSuccess }: ReauthModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lockedOut, setLockedOut] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setPassword('');
    setError(null);
    setLockedOut(false);
    setSubmitting(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { reauthToken } = await apiClient.post<{ reauthToken: string }>(
        `/vault/credentials/${serviceId}/reauth`,
        { adPassword: password },
      );
      reset();
      onSuccess(reauthToken);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError(strings.reauthWrongPassword);
      } else if (err instanceof ApiError && err.status === 423) {
        setError(err.message);
        setLockedOut(true);
      } else {
        setError(strings.reauthGenericError);
      }
      setSubmitting(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[22rem] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-card p-6 shadow-lg">
          <Dialog.Title className="font-heading text-lg font-semibold text-ink">
            {strings.reauthTitle}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-gray-600">
            {strings.reauthPrompt}
          </Dialog.Description>
          <form onSubmit={submit} className="mt-4 space-y-3">
            <label className="block text-sm">
              {strings.reauthPasswordField}
              <input
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby={error ? 'reauth-error' : undefined}
                className="mt-1 w-full rounded border border-line p-2"
              />
            </label>
            {error && (
              <p id="reauth-error" role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  reset();
                  onClose();
                }}
                className="px-3 py-1.5 text-sm"
              >
                {strings.vaultCancelButton}
              </button>
              <button
                type="submit"
                disabled={submitting || lockedOut || password.length === 0}
                className="rounded bg-ink px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {strings.reauthSubmitButton}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
