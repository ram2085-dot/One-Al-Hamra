import { strings } from '../strings';

export interface ServiceSummary {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  launchType: 'SSO' | 'CREDENTIAL';
}

interface Props {
  service: ServiceSummary;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  onOpen?: (id: string) => void;
}

export function ServiceTile({ service, isFavorite, onToggleFavorite, onOpen }: Props) {
  return (
    <article className="rounded-lg border border-line bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <span className="font-heading text-xs font-semibold uppercase tracking-wider text-accent">{service.category}</span>
      <div className="mt-1 flex items-start justify-between">
        <h3 className="font-heading font-semibold text-ink">
          <button type="button" onClick={() => onOpen?.(service.id)} className="text-left hover:underline">
            {service.name}
          </button>
        </h3>
        <button
          type="button"
          aria-label={isFavorite ? strings.favoriteRemove : strings.favoriteAdd}
          aria-pressed={isFavorite}
          onClick={() => onToggleFavorite(service.id)}
          className={`text-lg ${isFavorite ? 'text-accent' : 'text-gray-400'}`}
        >
          {isFavorite ? '★' : '☆'}
        </button>
      </div>
      <p className="mt-1 text-sm text-gray-600">{service.description}</p>
    </article>
  );
}
