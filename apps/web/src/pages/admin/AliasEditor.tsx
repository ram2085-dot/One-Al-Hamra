import { useState, type FormEvent } from 'react';
import { apiClient } from '../../api/client';
import { strings } from '../../strings';

export function AliasEditor({ serviceId }: { serviceId: string }) {
  const [alias, setAlias] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await apiClient.post(`/admin/services/${serviceId}/aliases`, { alias });
    setAlias('');
  }

  return (
    <form onSubmit={onSubmit} aria-label={`${strings.addAliasAriaPrefix} ${serviceId}`} className="flex gap-2">
      <label htmlFor={`alias-${serviceId}`} className="sr-only">{strings.aliasLabel}</label>
      <input id={`alias-${serviceId}`} required placeholder={strings.aliasLabel} value={alias} onChange={(e) => setAlias(e.target.value)} className="rounded border px-2 py-1 text-sm" />
      <button type="submit" className="rounded border px-2 py-1 text-sm">{strings.addAliasButton}</button>
    </form>
  );
}
