// apps/web/src/pages/admin/LaunchUrlEditor.tsx
import { useState, type FormEvent } from 'react';
import { apiClient } from '../../api/client';
import { strings } from '../../strings';

export function LaunchUrlEditor({
  serviceId,
  launchUrl,
  onChanged,
}: {
  serviceId: string;
  launchUrl: string | null;
  onChanged?: () => void;
}) {
  const [value, setValue] = useState(launchUrl ?? '');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await apiClient.patch(`/admin/services/${serviceId}`, { launchUrl: value || null });
    } finally {
      onChanged?.();
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-1">
      <label htmlFor={`launch-url-${serviceId}`} className="font-heading text-xs font-semibold uppercase tracking-wider text-gray-600">
        {strings.launchUrlLabel}
      </label>
      <div className="flex gap-2">
        <input
          id={`launch-url-${serviceId}`}
          type="url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://example.com"
          className="block w-full rounded border px-2 py-1 text-sm"
        />
        <button type="submit" className="rounded border border-line px-3 py-1 text-sm hover:border-accent">
          {strings.saveButton}
        </button>
      </div>
    </form>
  );
}
