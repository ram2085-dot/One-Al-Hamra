import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ServiceDetail } from '../pages/ServiceDetail';
import * as client from '../api/client';

const service = {
  id: 's1', name: 'Finance Expense System', description: 'Submit expenses.',
  category: 'Finance', tags: [], launchType: 'SSO', vendorName: 'Concur',
  supportContact: 'finance-support@launchpad.local', docsUrl: null,
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/services/:id" element={<ServiceDetail />} /></Routes>
    </MemoryRouter>,
  );
}

describe('ServiceDetail', () => {
  beforeEach(() => {
    vi.spyOn(client.apiClient, 'get').mockResolvedValue(service as any);
    vi.spyOn(client.apiClient, 'post').mockResolvedValue({ ok: true } as any);
  });

  it('loads and displays service details including vendor and support contact', async () => {
    renderAt('/services/s1');
    await waitFor(() => expect(screen.getByText('Finance Expense System')).toBeInTheDocument());
    expect(screen.getByText('Concur')).toBeInTheDocument();
    expect(screen.getByText('finance-support@launchpad.local')).toBeInTheDocument();
  });

  it('submits a report-issue request', async () => {
    renderAt('/services/s1');
    await waitFor(() => expect(screen.getByText('Finance Expense System')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /report an issue/i }));
    await userEvent.type(screen.getByLabelText(/describe the issue/i), 'Broken link');
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => expect(client.apiClient.post).toHaveBeenCalledWith('/catalog/s1/report-issue', { description: 'Broken link' }));
  });
});
