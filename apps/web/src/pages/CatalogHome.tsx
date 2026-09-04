import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { ServiceTile, type ServiceSummary } from '../components/ServiceTile';
import { SearchBar } from '../components/SearchBar';
import { CategoryFilter } from '../components/CategoryFilter';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { strings } from '../strings';

export function CatalogHome() {
  const navigate = useNavigate();
  const [allServices, setAllServices] = useState<ServiceSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ServiceSummary[] | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [launchError, setLaunchError] = useState<string | null>(null);

  /**
   * Search responses carry `isFavorite` too, but they are a partial view, so they may only ADD to
   * the set — never remove — or they would clobber an optimistic toggle made since the page loaded.
   * The authoritative full seed comes from the `/catalog` load below.
   */
  const rememberFavorites = useCallback((services: ServiceSummary[]) => {
    setFavorites((current) => {
      const next = new Set(current);
      for (const s of services) if (s.isFavorite) next.add(s.id);
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    apiClient
      .get<ServiceSummary[]>('/catalog')
      .then((services) => {
        if (cancelled) return;
        // Without this the stars always render unfilled on load, and the first click on an
        // already-favorited service would take the "add" branch instead of "remove".
        setFavorites(new Set(services.filter((s) => s.isFavorite).map((s) => s.id)));
        setAllServices(services);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    const handle = setTimeout(() => {
      apiClient
        .get<ServiceSummary[]>(`/catalog/search?q=${encodeURIComponent(query)}`)
        .then((results) => {
          rememberFavorites(results);
          setSearchResults(results);
        })
        .catch(() => setSearchResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [query, rememberFavorites]);

  const baseList = searchResults ?? allServices ?? [];
  const categories = useMemo(() => [...new Set((allServices ?? []).map((s) => s.category))], [allServices]);
  const visible = category ? baseList.filter((s) => s.category === category) : baseList;

  async function toggleFavorite(id: string) {
    const wasFavorite = favorites.has(id);
    const next = new Set(favorites);
    if (wasFavorite) next.delete(id);
    else next.add(id);
    setFavorites(next);
    try {
      if (wasFavorite) await apiClient.delete(`/catalog/${id}/favorite`);
      else await apiClient.post(`/catalog/${id}/favorite`);
    } catch {
      // Roll the star back so it never shows a state the server did not accept.
      setFavorites((current) => {
        const reverted = new Set(current);
        if (wasFavorite) reverted.add(id);
        else reverted.delete(id);
        return reverted;
      });
    }
  }

  /**
   * A click launches straight into the external site — no detail page, no separate Launch button.
   * The POST fires the same CATALOG_LAUNCH audit row and entitlement re-check the old detail-page
   * Launch button used to trigger; only the navigation destination changed.
   */
  async function launchService(service: ServiceSummary) {
    if (service.launchType === 'CREDENTIAL') {
      navigate(`/services/${service.id}/credentials`);
      return;
    }
    if (!service.launchUrl) {
      setLaunchError(strings.launchNotConfiguredHint);
      return;
    }
    setLaunchError(null);
    try {
      await apiClient.post(`/catalog/${service.id}/launch`);
    } catch {
      // Best-effort audit — a logging failure should never block the employee from reaching
      // the service they're entitled to.
    }
    window.open(service.launchUrl, '_blank', 'noopener,noreferrer');
  }

  if (loadFailed) return <ErrorState onRetry={() => setReloadKey((k) => k + 1)} />;
  if (allServices === null) return <p role="status">{strings.loadingLabel}</p>;

  if (allServices.length === 0) {
    return <EmptyState title={strings.emptyEntitlementsTitle} hint={strings.emptyEntitlementsHint} />;
  }

  return (
    <main className="mx-auto max-w-5xl space-y-4 bg-surface p-6">
      <h1 className="font-heading text-2xl font-bold text-ink">{strings.appName}</h1>
      <SearchBar value={query} onChange={setQuery} />
      <CategoryFilter categories={categories} selected={category} onSelect={setCategory} />
      {launchError && <p role="alert" className="text-sm text-red-600">{launchError}</p>}
      {visible.length === 0 ? (
        <EmptyState title={strings.noResultsTitle} hint={strings.noResultsHint} categories={categories} onSelectCategory={setCategory} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((s) => (
            <ServiceTile key={s.id} service={s} isFavorite={favorites.has(s.id)} onToggleFavorite={toggleFavorite} onLaunch={launchService} />
          ))}
        </div>
      )}
    </main>
  );
}
