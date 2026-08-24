import { useState, type FormEvent } from 'react';
import { apiClient } from '../../api/client';
import { strings } from '../../strings';

export function EntitlementEditor({ serviceId }: { serviceId: string }) {
  const [department, setDepartment] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await apiClient.post(`/admin/services/${serviceId}/entitlements`, { department: department || undefined });
    setDepartment('');
  }

  return (
    <form onSubmit={onSubmit} aria-label={`${strings.addEntitlementAriaPrefix} ${serviceId}`} className="flex gap-2">
      <label htmlFor={`ent-dept-${serviceId}`} className="sr-only">{strings.departmentLabel}</label>
      <input id={`ent-dept-${serviceId}`} placeholder={strings.departmentLabel} value={department} onChange={(e) => setDepartment(e.target.value)} className="rounded border px-2 py-1 text-sm" />
      <button type="submit" className="rounded border px-2 py-1 text-sm">{strings.addEntitlementButton}</button>
    </form>
  );
}
