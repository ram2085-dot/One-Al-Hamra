// Minimal stub — expanded with full empty-state UX (illustrations, category suggestion chips, etc.) in Task 16.
export function EmptyState({ title, hint }: { title: string; hint: string; categories?: string[]; onSelectCategory?: (c: string) => void }) {
  return (
    <div role="status" className="rounded border border-dashed border-line p-8 text-center">
      <p className="font-heading font-medium text-ink">{title}</p>
      <p className="text-sm text-gray-600">{hint}</p>
    </div>
  );
}
