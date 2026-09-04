import { ReauthTokenStore } from './reauth-token.store';

describe('ReauthTokenStore', () => {
  let store: ReauthTokenStore;
  beforeEach(() => { store = new ReauthTokenStore(); });

  it('issues a token that consume() accepts exactly once for the matching scope', () => {
    const t = store.issue({ userId: 'u1', serviceId: 's1' });
    expect(store.consume(t, 'u1', 's1')).toBe(true);
    expect(store.consume(t, 'u1', 's1')).toBe(false); // single-use
  });

  it('rejects a token used for a different user or service', () => {
    const t = store.issue({ userId: 'u1', serviceId: 's1' });
    expect(store.consume(t, 'u2', 's1')).toBe(false);
    expect(store.consume(t, 'u1', 's2')).toBe(false);
  });

  it('rejects an expired token', () => {
    jest.useFakeTimers();
    const t = store.issue({ userId: 'u1', serviceId: 's1' });
    jest.advanceTimersByTime(2 * 60 * 1000 + 1);
    expect(store.consume(t, 'u1', 's1')).toBe(false);
    jest.useRealTimers();
  });

  it('rejects an unknown token', () => {
    expect(store.consume('never-issued', 'u1', 's1')).toBe(false);
  });
});
