import { strings } from '../strings';

export function CategoryFilter({ categories, selected, onSelect }: { categories: string[]; selected: string | null; onSelect: (c: string | null) => void }) {
  const pillClass = (active: boolean) =>
    `rounded border px-2 py-1 text-sm font-medium ${active ? 'border-accent bg-accent text-white' : 'border-line bg-card text-ink hover:border-accent'}`;
  return (
    <div role="group" aria-label={strings.categoryFilterLabel} className="flex gap-2">
      <button type="button" aria-pressed={selected === null} onClick={() => onSelect(null)} className={pillClass(selected === null)}>
        {strings.categoryFilterAll}
      </button>
      {categories.map((c) => (
        <button key={c} type="button" aria-pressed={selected === c} onClick={() => onSelect(c)} className={pillClass(selected === c)}>
          {c}
        </button>
      ))}
    </div>
  );
}
