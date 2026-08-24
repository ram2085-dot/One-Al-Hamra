import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { AdminConsole } from '../pages/admin/AdminConsole';
import * as client from '../api/client';

const services = [
  { id: 's1', name: 'Finance Expense System', status: 'ACTIVE', category: 'Finance' },
  { id: 's2', name: 'Legacy Timesheet Tool', status: 'RETIRED', category: 'HR' },
];

describe('AdminConsole', () => {
  beforeEach(() => {
    vi.spyOn(client.apiClient, 'get').mockResolvedValue(services as any);
    vi.spyOn(client.apiClient, 'patch').mockResolvedValue({} as any);
  });

  it('lists all services including retired ones', async () => {
    render(<AdminConsole />);
    await waitFor(() => expect(screen.getByText('Finance Expense System')).toBeInTheDocument());
    expect(screen.getByText('Legacy Timesheet Tool')).toBeInTheDocument();
  });

  it('deactivating a service calls PATCH with status INACTIVE', async () => {
    render(<AdminConsole />);
    await waitFor(() => expect(screen.getByText('Finance Expense System')).toBeInTheDocument());
    const row = screen.getByText('Finance Expense System').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: /deactivate/i }));
    await waitFor(() => expect(client.apiClient.patch).toHaveBeenCalledWith('/admin/services/s1', { status: 'INACTIVE' }));
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<AdminConsole />);
    await waitFor(() => expect(screen.getByText('Finance Expense System')).toBeInTheDocument());
    expect(await axe(container)).toHaveNoViolations();
  });
});
