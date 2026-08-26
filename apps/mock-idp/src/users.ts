import { Pool } from 'pg';

export interface MockUser {
  id: string;
  email: string;
  displayName: string;
  department: string;
  role: string;
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SELECT_COLUMNS = `id, email, "displayName", department, role`;

export async function listUsers(): Promise<MockUser[]> {
  const { rows } = await pool.query(`SELECT ${SELECT_COLUMNS} FROM "User" ORDER BY "displayName"`);
  return rows;
}

export async function findUserById(id: string): Promise<MockUser | null> {
  const { rows } = await pool.query(`SELECT ${SELECT_COLUMNS} FROM "User" WHERE id = $1`, [id]);
  return rows[0] ?? null;
}
