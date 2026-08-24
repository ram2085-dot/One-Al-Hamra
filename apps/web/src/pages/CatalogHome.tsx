import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { ServiceTile, type ServiceSummary } from '../components/ServiceTile';
import { SearchBar } from '../components/SearchBar';
import { CategoryFilter } from '../components/CategoryFilter';
import { EmptyState } from '../components/EmptyState';
import { strings } from '../strings';

export function CatalogHome() {
  const navigate = useNavigate();
  const [allServices, setAllServices] = useState<ServiceSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ServiceSummary[] | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  useEffect(() => {
    apiClient.get<ServiceSummary[]>('/catalog').then(setAllServices);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    const handle = setTimeout(() => {
      apiClient.get<ServiceSummary[]>(`/catalog/search?q=${encodeURIComponent(query)}`).then(setSearchResults);
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const baseList = searchResults ?? allServices ?? [];
  const categories = useMemo(() => [...new Set((allServices ?? []).map((s) => s.category))], [allServices]);
  const visible = category ? baseList.filter((s) => s.category === category) : baseList;

  async function toggleFavorite(id: string) {
    const next = new Set(favorites);
    if (next.has(id)) {
      next.delete(id);
      await apiClient.delete(`/catalog/${id}/favorite`);
    } else {
      next.add(id);
      await apiClient.post(`/catalog/${id}/favorite`);
    }
    setFavorites(next);
  }

  if (allServices === null) return <p role="status">{strings.loadingLabel}</p>;

  if (allServices.length === 0) {
    return <EmptyState title={strings.emptyEntitlementsTitle} hint={strings.emptyEntitlementsHint} />;
  }

  return (
    <main className="mx-auto max-w-5xl space-y-4 bg-surface p-6">
      <h1 className="font-heading text-2xl font-bold text-ink">{strings.appName}</h1>
      <SearchBar value={query} onChange={setQuery} />
      <CategoryFilter categories={categories} selected={category} onSelect={setCategory} />
      {visible.length === 0 ? (
        <EmptyState title={strings.noResultsTitle} hint={strings.noResultsHint} categories={categories} onSelectCategory={setCategory} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((s) => (
            <ServiceTile key={s.id} service={s} isFavorite={favorites.has(s.id)} onToggleFavorite={toggleFavorite} onOpen={(id) => navigate(`/services/${id}`)} />
          ))}
        </div>
      )}
    </main>
  );
}
