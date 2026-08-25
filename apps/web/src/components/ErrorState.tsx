import { strings } from '../strings';

/**
 * Plain-language failure panel for a page whose data could not load. Mirrors EmptyState's shape,
 * but announces as an alert and offers a retry so a failed fetch cannot leave the page stuck on
 * "Loading…" forever. Prototype-level: no toasts, no automatic retry.
 */
export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-2xl space-y-3 rounded border border-dashed border-line bg-card p-8 text-center">
      <p className="font-heading font-semibold text-ink">{strings.loadErrorTitle}</p>
      <p className="text-sm text-gray-600">{strings.loadErrorHint}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="rounded border border-line px-3 py-1 text-sm hover:border-accent">
          {strings.retryButton}
        </button>
      )}
      <p className="text-sm">
        {strings.stillStuckPrefix} <a href="mailto:helpdesk@launchpad.local" className="text-accent underline">{strings.helpDeskLinkText}</a>.
      </p>
    </div>
  );
}
