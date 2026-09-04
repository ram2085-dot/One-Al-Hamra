import { hashPassword, verifyPassword } from './password-hash';

describe('password-hash', () => {
  it('verifies a correct password against its own hash', () => {
    const stored = hashPassword('correct horse');
    expect(verifyPassword('correct horse', stored)).toBe(true);
  });

  it('rejects a wrong password', () => {
    const stored = hashPassword('correct horse');
    expect(verifyPassword('battery staple', stored)).toBe(false);
  });

  it('salts: two hashes of the same password differ', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'));
  });

  it('rejects a malformed stored value without throwing', () => {
    expect(verifyPassword('x', 'not-a-valid-hash')).toBe(false);
  });
});
