import { strings } from '../strings';

export function EmptyState({
  title, hint, categories = [], onSelectCategory,
}: {
  title: string; hint: string; categories?: string[]; onSelectCategory?: (c: string) => void;
}) {
  return (
    <div role="status" className="space-y-3 rounded border border-dashed border-line bg-card p-8 text-center">
      <p className="font-heading font-semibold text-ink">{title}</p>
      <p className="text-sm text-gray-600">{hint}</p>
      {categories.length > 0 && (
        <div>
          <p className="text-sm font-medium">{strings.browseCategoryLabel}</p>
          <div className="mt-1 flex justify-center gap-2">
            {categories.map((c) => (
              <button key={c} type="button" onClick={() => onSelectCategory?.(c)} className="rounded border border-line px-2 py-1 text-sm hover:border-accent">
                {c}
              </button>
            ))}
          </div>
        </div>
      )}
      <button type="button" disabled aria-disabled="true" className="rounded border border-line px-3 py-1 text-sm text-gray-400" title="Coming soon">
        {strings.requestServiceButton}
      </button>
      <p className="text-sm">
        {strings.stillStuckPrefix} <a href="mailto:helpdesk@launchpad.local" className="text-accent underline">{strings.helpDeskLinkText}</a>.
      </p>
    </div>
  );
}
