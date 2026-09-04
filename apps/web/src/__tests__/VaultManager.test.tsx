import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { VaultManager } from '../pages/VaultManager';
import { apiClient } from '../api/client';

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<any>('../api/client');
  return { ...actual, apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});
const api = apiClient as unknown as Record<string, ReturnType<typeof vi.fn>>;

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes><Route path="/services/:id/credentials" element={<VaultManager />} /></Routes>
    </MemoryRouter>,
  );
}

// Radix Dialog mounts a focus-scope / dismissable-layer whose effects settle asynchronously, so every
// interaction that opens or drives the modal is wrapped in act() to keep those state updates — ours
// and Radix's — inside the act scope and the console output clean (mirrors ReauthModal.test.tsx).
// A macrotask tick drains every queued microtask (the modal's reauth POST, then the gated call, then
// the refetch and its state updates) so they all settle inside the surrounding act() scope.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function actClick(el: HTMLElement) {
  await act(async () => {
    await userEvent.click(el);
    await settle();
  });
}

async function reauthAndContinue(value: string) {
  await act(async () => {
    await userEvent.type(screen.getByLabelText(/windows password/i), value);
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    await settle();
  });
}

beforeEach(() => vi.clearAllMocks());

it('lists stored credentials and marks the default', async () => {
  api.get.mockResolvedValueOnce([
    { id: 'c1', label: 'Personal', username: 'jdoe', isDefault: true, lastRotatedAt: '2026-09-01T00:00:00Z', passwordExpiresAt: null },
  ]);
  renderAt('/services/hr1/credentials');
  const row = await screen.findByRole('row', { name: /jdoe/i });
  expect(within(row).getByText(/default/i)).toBeInTheDocument();
});

it('shows the empty state when there are no credentials', async () => {
  api.get.mockResolvedValueOnce([]);
  renderAt('/services/hr1/credentials');
  expect(await screen.findByText(/no stored credential yet/i)).toBeInTheDocument();
});

it('shows the FR-17 failure banner when ?credentialLaunchFailed=1', async () => {
  api.get.mockResolvedValueOnce([{ id: 'c1', label: null, username: 'jdoe', isDefault: true, lastRotatedAt: '2026-09-01T00:00:00Z', passwordExpiresAt: null }]);
  renderAt('/services/hr1/credentials?credentialLaunchFailed=1');
  expect(await screen.findByRole('alert')).toHaveTextContent(/didn't work/i);
});

it('Launch posts to credential-launch and navigates to the inject URL', async () => {
  api.get.mockResolvedValueOnce([{ id: 'c1', label: null, username: 'jdoe', isDefault: true, lastRotatedAt: '2026-09-01T00:00:00Z', passwordExpiresAt: null }]);
  api.post.mockResolvedValueOnce({ injectUrl: 'http://localhost:3001/credential-launch/inject/tok' });
  // jsdom: stub the navigation sink
  const hrefSetter = vi.fn();
  Object.defineProperty(window, 'location', { value: { ...window.location, set href(v: string) { hrefSetter(v); } }, writable: true });
  renderAt('/services/hr1/credentials');
  await screen.findByRole('button', { name: /^launch$/i });
  await userEvent.click(screen.getByRole('button', { name: /^launch$/i }));
  expect(api.post).toHaveBeenCalledWith('/credential-launch/hr1', undefined);
  expect(hrefSetter).toHaveBeenCalledWith('http://localhost:3001/credential-launch/inject/tok');
});

it('Reveal requires re-auth: opens the modal, then calls reveal with the returned token', async () => {
  api.get.mockResolvedValueOnce([{ id: 'c1', label: null, username: 'jdoe', isDefault: true, lastRotatedAt: '2026-09-01T00:00:00Z', passwordExpiresAt: null }]);
  api.post.mockResolvedValueOnce({ reauthToken: 'tok-9' });      // the modal's reauth POST
  api.get.mockResolvedValueOnce({ username: 'jdoe', password: 's3cret' }); // the reveal GET
  renderAt('/services/hr1/credentials');
  await actClick(await screen.findByRole('button', { name: /reveal/i }));
  await reauthAndContinue('pw');
  expect(api.get).toHaveBeenLastCalledWith('/vault/credentials/hr1/c1/reveal', { 'X-Reauth-Token': 'tok-9' });
  expect(await screen.findByText('s3cret')).toBeInTheDocument();
});

it('Edit sends only the changed fields, re-auth-gated, then refetches', async () => {
  api.get.mockResolvedValueOnce([
    { id: 'c1', label: 'Personal', username: 'jdoe', isDefault: true, lastRotatedAt: '2026-09-01T00:00:00Z', passwordExpiresAt: null },
  ]);
  api.post.mockResolvedValueOnce({ reauthToken: 'tok-e' }); // the modal's reauth POST
  api.patch.mockResolvedValueOnce(undefined); // the edit PATCH
  api.get.mockResolvedValueOnce([
    { id: 'c1', label: 'Work', username: 'jdoe', isDefault: true, lastRotatedAt: '2026-09-01T00:00:00Z', passwordExpiresAt: null },
  ]); // the refetch
  renderAt('/services/hr1/credentials');
  await actClick(await screen.findByRole('button', { name: /^edit$/i }));
  await act(async () => {
    const labelField = screen.getByLabelText(/label/i);
    await userEvent.clear(labelField);
    await userEvent.type(labelField, 'Work');
    await settle();
  });
  await actClick(screen.getByRole('button', { name: /^save$/i }));
  await reauthAndContinue('pw');
  // password field left blank + expiry untouched => body carries only the label
  expect(api.patch).toHaveBeenCalledWith('/vault/credentials/hr1/c1', { label: 'Work' }, { 'X-Reauth-Token': 'tok-e' });
  await screen.findByRole('row', { name: /work/i });
  expect(api.get).toHaveBeenLastCalledWith('/vault/credentials/hr1');
});

it('has no accessibility violations', async () => {
  api.get.mockResolvedValueOnce([
    { id: 'c1', label: 'Personal', username: 'jdoe', isDefault: true, lastRotatedAt: '2026-09-01T00:00:00Z', passwordExpiresAt: null },
    { id: 'c2', label: 'Shared', username: 'team', isDefault: false, lastRotatedAt: '2026-08-01T00:00:00Z', passwordExpiresAt: null },
  ]);
  const { container } = renderAt('/services/hr1/credentials');
  await screen.findByRole('row', { name: /jdoe/i });
  expect(await axe(container)).toHaveNoViolations();
});
