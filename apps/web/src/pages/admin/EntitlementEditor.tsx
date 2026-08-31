import { useState, type FormEvent } from 'react';
import { apiClient } from '../../api/client';
import { strings } from '../../strings';

export interface AdminEntitlement {
  id: string;
  department: string | null;
  role: string | null;
  group: string | null;
}

/** "Finance" / "Any department · ADMIN" — spells out that a null field is a wildcard. */
function describeEntitlement(entitlement: AdminEntitlement): string {
  return [
    entitlement.department ?? strings.anyDepartmentLabel,
    entitlement.role ?? strings.anyRoleLabel,
    entitlement.group,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function EntitlementEditor({
  serviceId,
  entitlements = [],
  onChanged,
}: {
  serviceId: string;
  entitlements?: AdminEntitlement[];
  onChanged?: () => void;
}) {
  const [department, setDepartment] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await apiClient.post(`/admin/services/${serviceId}/entitlements`, { department: department || undefined });
      setDepartment('');
    } finally {
      // Reload either way: on failure the refreshed list is what tells the admin nothing was added.
      onChanged?.();
    }
  }

  async function onRemove(entitlementId: string) {
    try {
      await apiClient.delete(`/admin/services/${serviceId}/entitlements/${entitlementId}`);
    } finally {
      onChanged?.();
    }
  }

  return (
    <section aria-label={`${strings.entitlementsHeading} ${serviceId}`} className="space-y-1">
      <h2 className="font-heading text-xs font-semibold uppercase tracking-wider text-gray-600">{strings.entitlementsHeading}</h2>
      {entitlements.length === 0 ? (
        <p className="text-sm text-gray-600">{strings.noEntitlementsMessage}</p>
      ) : (
        <ul className="space-y-1">
          {entitlements.map((entitlement) => (
            <li key={entitlement.id} className="flex items-center gap-2 text-sm">
              <span>{describeEntitlement(entitlement)}</span>
              <button
                type="button"
                onClick={() => onRemove(entitlement.id)}
                aria-label={`${strings.removeButton} ${strings.entitlementsHeading} ${describeEntitlement(entitlement)}`}
                className="rounded border px-2 py-0.5 text-xs"
              >
                {strings.removeButton}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={onSubmit} aria-label={`${strings.addEntitlementAriaPrefix} ${serviceId}`} className="flex gap-2">
        <label htmlFor={`ent-dept-${serviceId}`} className="sr-only">{strings.departmentLabel}</label>
        <input id={`ent-dept-${serviceId}`} placeholder={strings.departmentLabel} value={department} onChange={(e) => setDepartment(e.target.value)} className="rounded border px-2 py-1 text-sm" />
        <button type="submit" className="rounded border px-2 py-1 text-sm">{strings.addEntitlementButton}</button>
      </form>
    </section>
  );
}
