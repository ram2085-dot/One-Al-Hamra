import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import { ErrorState } from '../components/ErrorState';
import { strings } from '../strings';

interface ServiceDetailData {
  id: string; name: string; description: string; category: string;
  tags: string[]; vendorName: string | null; ownerName: string | null;
  supportContact: string; docsUrl: string | null;
}

export function ServiceDetail() {
  const { id } = useParams<{ id: string }>();
  const [service, setService] = useState<ServiceDetailData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [reporting, setReporting] = useState(false);
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoadFailed(false);
    apiClient
      .get<ServiceDetailData>(`/catalog/${id}`)
      .then((data) => {
        if (!cancelled) setService(data);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  async function onLaunch() {
    if (!id) return;
    setActionFailed(false);
    try {
      await apiClient.post(`/catalog/${id}/launch`);
    } catch {
      setActionFailed(true);
    }
  }

  async function onSubmitReport(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setActionFailed(false);
    try {
      await apiClient.post(`/catalog/${id}/report-issue`, { description });
      setSubmitted(true);
      setReporting(false);
    } catch {
      setActionFailed(true);
    }
  }

  if (loadFailed) return <ErrorState onRetry={() => setReloadKey((k) => k + 1)} />;
  if (!service) return <p role="status">{strings.loadingLabel}</p>;

  return (
    <main className="mx-auto max-w-2xl space-y-4 bg-surface p-6">
      <h1 className="font-heading text-2xl font-bold text-ink">{service.name}</h1>
      <p className="text-gray-700">{service.description}</p>
      <dl className="grid grid-cols-2 gap-2 rounded border border-line bg-card p-4 text-sm">
        <dt className="font-medium">{strings.categoryLabel}</dt><dd>{service.category}</dd>
        {service.vendorName && (<><dt className="font-medium">{strings.vendorLabel}</dt><dd>{service.vendorName}</dd></>)}
        {service.ownerName && (<><dt className="font-medium">{strings.ownerLabel}</dt><dd>{service.ownerName}</dd></>)}
        <dt className="font-medium">{strings.supportLabel}</dt><dd>{service.supportContact}</dd>
        {service.tags?.length > 0 && (
          <>
            <dt className="font-medium">{strings.tagsLabel}</dt>
            <dd>
              <ul className="flex flex-wrap gap-1">
                {service.tags.map((tag) => (
                  <li key={tag} className="rounded border border-line px-2 py-0.5 text-xs text-gray-700">{tag}</li>
                ))}
              </ul>
            </dd>
          </>
        )}
        {service.docsUrl && (
          <>
            <dt className="font-medium">{strings.documentationLabel}</dt>
            <dd><a href={service.docsUrl} className="text-accent underline">{strings.documentationLinkText}</a></dd>
          </>
        )}
      </dl>
      <button type="button" onClick={onLaunch} className="rounded bg-accent px-4 py-2 font-heading text-sm font-semibold uppercase tracking-wide text-white hover:bg-accent-dark">
        {strings.launchButton}
      </button>
      {!reporting && (
        <button type="button" onClick={() => setReporting(true)} className="ml-2 rounded border border-accent px-4 py-2 font-heading text-sm font-semibold uppercase tracking-wide text-accent hover:bg-accent hover:text-white">
          {strings.reportIssue}
        </button>
      )}
      {reporting && (
        <form onSubmit={onSubmitReport} className="space-y-2 rounded border border-line bg-card p-4">
          <label htmlFor="issue-description">{strings.describeIssueLabel}</label>
          <textarea id="issue-description" required value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded border border-line p-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent" />
          <button type="submit" className="rounded bg-accent px-4 py-2 font-heading text-sm font-semibold uppercase tracking-wide text-white hover:bg-accent-dark">{strings.submitButton}</button>
        </form>
      )}
      {submitted && <p role="status">{strings.reportSubmittedMessage}</p>}
      {actionFailed && <p role="alert" className="text-sm text-red-600">{strings.loadErrorHint}</p>}
    </main>
  );
}
