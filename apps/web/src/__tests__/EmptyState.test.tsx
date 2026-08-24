// apps/web/src/__tests__/EmptyState.test.tsx
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { EmptyState } from '../components/EmptyState';

describe('EmptyState', () => {
  it('shows suggested categories and a disabled request-access stub', () => {
    render(<EmptyState title="No results" hint="Try something else" categories={['Finance', 'Engineering']} onSelectCategory={() => {}} />);
    expect(screen.getByText('Finance')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request a new service/i })).toBeDisabled();
    expect(screen.getByText(/help desk/i)).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<EmptyState title="No results" hint="Try something else" categories={[]} onSelectCategory={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
