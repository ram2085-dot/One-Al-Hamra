import { Pool } from 'pg';
import { listUsers, findUserById } from './users';

jest.mock('pg', () => {
  const query = jest.fn();
  return { Pool: jest.fn(() => ({ query })) };
});

describe('users', () => {
  const mockRow = { id: 'u1', email: 'a@b.com', displayName: 'A B', department: 'IT', role: 'EMPLOYEE' };

  it('listUsers returns all seeded users ordered by display name', async () => {
    const pool = new Pool() as any;
    pool.query.mockResolvedValue({ rows: [mockRow] });
    const users = await listUsers();
    expect(users).toEqual([mockRow]);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY "displayName"'));
  });

  it('findUserById returns null when no row matches', async () => {
    const pool = new Pool() as any;
    pool.query.mockResolvedValue({ rows: [] });
    expect(await findUserById('missing')).toBeNull();
  });

  it('findUserById returns the matching user', async () => {
    const pool = new Pool() as any;
    pool.query.mockResolvedValue({ rows: [mockRow] });
    expect(await findUserById('u1')).toEqual(mockRow);
  });
});
