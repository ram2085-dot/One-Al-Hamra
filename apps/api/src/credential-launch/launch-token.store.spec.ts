import { LaunchTokenStore } from './launch-token.store';

describe('LaunchTokenStore', () => {
  let store: LaunchTokenStore;
  const payload = { username: 'u', password: 'p', failureRedirect: 'http://localhost:5173/x' };
  beforeEach(() => { store = new LaunchTokenStore(); });

  it('consume returns the payload exactly once', () => {
    const t = store.mint(payload);
    expect(store.consume(t)).toEqual(payload);
    expect(store.consume(t)).toBeNull();
  });

  it('consume returns null after the 60s TTL', () => {
    jest.useFakeTimers();
    const t = store.mint(payload);
    jest.advanceTimersByTime(60_000 + 1);
    expect(store.consume(t)).toBeNull();
    jest.useRealTimers();
  });

  it('consume returns null for an unknown token', () => {
    expect(store.consume('nope')).toBeNull();
  });
});
