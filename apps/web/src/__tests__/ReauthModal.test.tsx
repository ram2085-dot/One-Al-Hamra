import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { ReauthModal } from '../components/ReauthModal';
import { apiClient, ApiError } from '../api/client';

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<any>('../api/client');
  return { ...actual, apiClient: { ...actual.apiClient, post: vi.fn() } };
});
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;

function setup() {
  const onSuccess = vi.fn();
  const onClose = vi.fn();
  render(<ReauthModal serviceId="s1" open onClose={onClose} onSuccess={onSuccess} />);
  return { onSuccess, onClose };
}

// Radix Dialog's focus-scope reacts to the focus/keydown events these interactions dispatch, so the
// whole type-then-submit sequence is wrapped in act() to keep every resulting state update — ours
// and Radix's — inside the act scope and the console output clean.
async function typePasswordAndSubmit(value: string) {
  await act(async () => {
    await userEvent.type(screen.getByLabelText(/windows password/i), value);
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    await Promise.resolve();
  });
}

beforeEach(() => vi.clearAllMocks());

it('hands the reauthToken to onSuccess on a correct password', async () => {
  mockPost.mockResolvedValueOnce({ reauthToken: 'tok-123' });
  const { onSuccess } = setup();
  await typePasswordAndSubmit('pw');
  expect(mockPost).toHaveBeenCalledWith('/vault/credentials/s1/reauth', { adPassword: 'pw' });
  expect(onSuccess).toHaveBeenCalledWith('tok-123');
});

it('shows "wasn\'t recognized" on a 401 and keeps the modal open', async () => {
  mockPost.mockRejectedValueOnce(new ApiError(401, 'nope'));
  const { onSuccess, onClose } = setup();
  await typePasswordAndSubmit('bad');
  expect(screen.getByText(/wasn't recognized/i)).toBeInTheDocument();
  expect(onSuccess).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});

it('shows the server lockout message on a 423 and disables submit', async () => {
  mockPost.mockRejectedValueOnce(
    new ApiError(423, 'Too many failed attempts. Try again in about 5 minute(s).'),
  );
  setup();
  await typePasswordAndSubmit('bad');
  expect(screen.getByText(/too many failed attempts/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
});

it('has no accessibility violations', async () => {
  const { container } = render(
    <ReauthModal serviceId="s1" open onClose={() => {}} onSuccess={() => {}} />,
  );
  expect(await axe(container)).toHaveNoViolations();
});
