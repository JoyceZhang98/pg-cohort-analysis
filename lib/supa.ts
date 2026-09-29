import { Pool } from 'pg';

// Best-effort Supabase (Postgres) pool. Returns null if SUPABASE_DB_URL isn't set,
// so the dashboard still works (Supabase-sourced metrics just show "—").
declare global {
  // eslint-disable-next-line no-var
  var _supaPool: Pool | null | undefined;
}

export function supaPool(): Pool | null {
  if (global._supaPool !== undefined) return global._supaPool;
  const url = process.env.SUPABASE_DB_URL;
  global._supaPool = url
    ? new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 3, keepAlive: true, connectionTimeoutMillis: 8000 })
    : null;
  return global._supaPool;
}
