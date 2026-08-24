import { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { ServiceForm } from './ServiceForm';
import { EntitlementEditor } from './EntitlementEditor';
import { AliasEditor } from './AliasEditor';
import { strings } from '../../strings';

interface AdminService {
  id: string; name: string; category: string; status: 'ACTIVE' | 'INACTIVE' | 'RETIRED';
}

export function AdminConsole() {
  const { user } = useAuth();
  const [services, setServices] = useState<AdminService[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  function reload() {
    apiClient.get<AdminService[]>('/admin/services').then(setServices);
  }

  useEffect(reload, []);

  async function setStatus(id: string, status: 'ACTIVE' | 'INACTIVE' | 'RETIRED') {
    await apiClient.patch(`/admin/services/${id}`, { status });
    reload();
  }

  if (!services) return <p role="status">{strings.loadingLabel}</p>;

  return (
    <main className="mx-auto max-w-4xl space-y-6 bg-surface p-6">
      <h1 className="font-heading text-2xl font-bold text-ink">{strings.adminConsoleTitle}</h1>
      {user && <ServiceForm ownerId={user.id} onCreated={reload} />}
      <table className="w-full rounded border border-line bg-card text-left text-sm">
        <thead className="border-b border-line">
          <tr><th scope="col" className="p-2">{strings.nameLabel}</th><th scope="col" className="p-2">{strings.categoryLabel}</th><th scope="col" className="p-2">{strings.statusLabel}</th><th scope="col" className="p-2">{strings.actionsLabel}</th></tr>
        </thead>
        <tbody>
          {services.map((s) => (
            <>
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.category}</td>
                <td>{s.status}</td>
                <td className="space-x-2">
                  {s.status === 'ACTIVE' && <button type="button" onClick={() => setStatus(s.id, 'INACTIVE')}>{strings.deactivateButton}</button>}
                  {s.status === 'INACTIVE' && <button type="button" onClick={() => setStatus(s.id, 'ACTIVE')}>{strings.activateButton}</button>}
                  {s.status !== 'RETIRED' && <button type="button" onClick={() => setStatus(s.id, 'RETIRED')}>{strings.retireButton}</button>}
                  <button type="button" onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                    {expanded === s.id ? strings.hideButton : strings.manageEntitlementsAliasesButton}
                  </button>
                </td>
              </tr>
              {expanded === s.id && (
                <tr key={`${s.id}-editors`}>
                  <td colSpan={4} className="space-y-2 bg-gray-50 p-3">
                    <EntitlementEditor serviceId={s.id} />
                    <AliasEditor serviceId={s.id} />
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </main>
  );
}
