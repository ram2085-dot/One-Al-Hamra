import { strings } from '../strings';

export function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="search"
      role="searchbox"
      aria-label={strings.searchPlaceholder}
      placeholder={strings.searchPlaceholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-line px-3 py-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
    />
  );
}
