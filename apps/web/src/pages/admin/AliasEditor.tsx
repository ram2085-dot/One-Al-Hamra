import { useState, type FormEvent } from 'react';
import { apiClient } from '../../api/client';
import { strings } from '../../strings';

export interface AdminAlias {
  id: string;
  alias: string;
}

export function AliasEditor({
  serviceId,
  aliases = [],
  onChanged,
}: {
  serviceId: string;
  aliases?: AdminAlias[];
  onChanged?: () => void;
}) {
  const [alias, setAlias] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await apiClient.post(`/admin/services/${serviceId}/aliases`, { alias });
      setAlias('');
    } finally {
      onChanged?.();
    }
  }

  async function onRemove(aliasId: string) {
    try {
      await apiClient.delete(`/admin/services/${serviceId}/aliases/${aliasId}`);
    } finally {
      onChanged?.();
    }
  }

  return (
    <section aria-label={`${strings.aliasesHeading} ${serviceId}`} className="space-y-1">
      <h2 className="font-heading text-xs font-semibold uppercase tracking-wider text-gray-600">{strings.aliasesHeading}</h2>
      {aliases.length === 0 ? (
        <p className="text-sm text-gray-600">{strings.noAliasesMessage}</p>
      ) : (
        <ul className="space-y-1">
          {aliases.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-sm">
              <span>{a.alias}</span>
              <button
                type="button"
                onClick={() => onRemove(a.id)}
                aria-label={`${strings.removeButton} ${strings.aliasLabel} ${a.alias}`}
                className="rounded border px-2 py-0.5 text-xs"
              >
                {strings.removeButton}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={onSubmit} aria-label={`${strings.addAliasAriaPrefix} ${serviceId}`} className="flex gap-2">
        <label htmlFor={`alias-${serviceId}`} className="sr-only">{strings.aliasLabel}</label>
        <input id={`alias-${serviceId}`} required placeholder={strings.aliasLabel} value={alias} onChange={(e) => setAlias(e.target.value)} className="rounded border px-2 py-1 text-sm" />
        <button type="submit" className="rounded border px-2 py-1 text-sm">{strings.addAliasButton}</button>
      </form>
    </section>
  );
}
