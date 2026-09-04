import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { MemoryRouter } from 'react-router-dom';
import { CatalogHome } from '../pages/CatalogHome';
import * as client from '../api/client';

const { navigateSpy } = vi.hoisted(() => ({ navigateSpy: vi.fn() }));

vi.mock('react-router-dom', async (importActual) => {
  const actual = await importActual<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateSpy };
});

const services = [
  { id: 's1', name: 'Finance Expense System', description: 'd', category: 'Finance', tags: [], launchType: 'SSO' },
  { id: 's2', name: 'Source Code Repository', description: 'd', category: 'Engineering', tags: [], launchType: 'SSO' },
];

function renderCatalogHome() {
  return render(
    <MemoryRouter>
      <CatalogHome />
    </MemoryRouter>,
  );
}

describe('CatalogHome', () => {
  beforeEach(() => {
    vi.spyOn(client.apiClient, 'get').mockImplementation((path: string) => {
      if (path === '/catalog') return Promise.resolve(services as any);
      if (path.startsWith('/catalog/search')) return Promise.resolve([services[0]] as any);
      return Promise.reject(new Error('unexpected path'));
    });
    vi.spyOn(client.apiClient, 'post').mockResolvedValue(undefined as any);
    vi.spyOn(client.apiClient, 'delete').mockResolvedValue(undefined as any);
    navigateSpy.mockClear();
  });

  it('loads and displays entitled services', async () => {
    renderCatalogHome();
    await waitFor(() => expect(screen.getByText('Finance Expense System')).toBeInTheDocument());
    expect(screen.getByText('Source Code Repository')).toBeInTheDocument();
  });

  it('filters results as the user types in search', async () => {
    renderCatalogHome();
    await waitFor(() => expect(screen.getByText('Finance Expense System')).toBeInTheDocument());
    await userEvent.type(screen.getByRole('searchbox'), 'expence');
    await waitFor(() => expect(screen.queryByText('Source Code Repository')).not.toBeInTheDocument());
    expect(screen.getByText('Finance Expense System')).toBeInTheDocument();
  });

  it('clicking a CREDENTIAL service navigates to its credentials page instead of opening a URL', async () => {
    vi.spyOn(client.apiClient, 'get').mockImplementation((path: string) => {
      if (path === '/catalog') {
        return Promise.resolve([
          {
            id: 'hr1',
            name: 'HR Self-Service Portal',
            description: 'x',
            category: 'HR',
            tags: [],
            launchType: 'CREDENTIAL',
            launchUrl: 'https://example.com',
            isFavorite: false,
          },
        ] as any);
      }
      return Promise.reject(new Error('unexpected path'));
    });
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    renderCatalogHome();
    await screen.findByText('HR Self-Service Portal');
    await userEvent.click(screen.getByRole('button', { name: 'HR Self-Service Portal' }));

    expect(openSpy).not.toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith('/services/hr1/credentials');
  });

  it('has no accessibility violations once loaded', async () => {
    const { container } = renderCatalogHome();
    await waitFor(() => expect(screen.getByText('Finance Expense System')).toBeInTheDocument());
    expect(await axe(container)).toHaveNoViolations();
  });
});
