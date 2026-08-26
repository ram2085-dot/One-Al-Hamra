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
    vi.spyOn(client.apiClient, 'get').mockImplementation((path: string) => {
      if (path === '/catalog/s1') return Promise.resolve(service as any);
      return Promise.reject(new Error('unexpected path'));
    });
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

  it('SSO launch navigates the browser to the resolved redirect URL', async () => {
    const originalLocation = window.location;
    // jsdom's window.location isn't directly assignable -- and this project's TypeScript
    // types the location setter as accepting only a string (`set location(href: string)`),
    // so `window.location = someLocationObject` fails to typecheck even with a `delete`
    // first. Redefining the property via Object.defineProperty is the standard workaround
    // for asserting on a full-page navigation in a jsdom test.
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...originalLocation, href: '' },
    });

    vi.spyOn(client.apiClient, 'get').mockImplementation((path: string) => {
      if (path === '/catalog/s1') return Promise.resolve(service as any);
      if (path === '/sso-launch/s1') return Promise.resolve({ redirectUrl: 'http://localhost:4001/login' } as any);
      return Promise.reject(new Error('unexpected path'));
    });

    renderAt('/services/s1');
    await waitFor(() => expect(screen.getByText('Finance Expense System')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /launch/i }));
    await waitFor(() => expect(window.location.href).toBe('http://localhost:4001/login'));

    Object.defineProperty(window, 'location', { writable: true, value: originalLocation });
  });
});
