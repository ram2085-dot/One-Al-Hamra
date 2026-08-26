// apps/web/src/pages/admin/SsoTargetEditor.tsx
import { apiClient } from '../../api/client';
import { strings } from '../../strings';

export function SsoTargetEditor({
  serviceId,
  ssoTargetApp,
  onChanged,
}: {
  serviceId: string;
  ssoTargetApp: 'DEMO_APP_A' | 'DEMO_APP_B' | null;
  onChanged?: () => void;
}) {
  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value || null;
    try {
      await apiClient.patch(`/admin/services/${serviceId}`, { ssoTargetApp: value });
    } finally {
      onChanged?.();
    }
  }

  return (
    <div className="space-y-1">
      <label htmlFor={`sso-target-${serviceId}`} className="font-heading text-xs font-semibold uppercase tracking-wider text-gray-600">
        {strings.ssoTargetLabel}
      </label>
      <select
        id={`sso-target-${serviceId}`}
        value={ssoTargetApp ?? ''}
        onChange={onChange}
        className="block rounded border px-2 py-1 text-sm"
      >
        <option value="">{strings.ssoTargetNone}</option>
        <option value="DEMO_APP_A">{strings.ssoTargetDemoAppA}</option>
        <option value="DEMO_APP_B">{strings.ssoTargetDemoAppB}</option>
      </select>
    </div>
  );
}
