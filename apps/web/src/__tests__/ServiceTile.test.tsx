import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { ServiceTile } from '../components/ServiceTile';

const service = {
  id: 's1', name: 'Finance Expense System', description: 'Submit expenses.',
  category: 'Finance', tags: ['expenses'], launchType: 'SSO' as const,
};

describe('ServiceTile', () => {
  it('renders the service name and calls onToggleFavorite when the favorite button is clicked', async () => {
    const onToggleFavorite = vi.fn();
    render(<ServiceTile service={service} isFavorite={false} onToggleFavorite={onToggleFavorite} />);
    expect(screen.getByText('Finance Expense System')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /add to favorites/i }));
    expect(onToggleFavorite).toHaveBeenCalledWith('s1');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<ServiceTile service={service} isFavorite={false} onToggleFavorite={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
