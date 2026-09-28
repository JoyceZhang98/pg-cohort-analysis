import { Pool } from 'pg';

// Single shared pool across hot reloads / lambda invocations.
declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

function makePool() {
  // Support either a single connection string or discrete TIMESCALE_* vars.
  if (process.env.DATABASE_URL) {
    return new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
      keepAlive: true,
    });
  }
  return new Pool({
    host: process.env.TIMESCALE_HOST,
    port: Number(process.env.TIMESCALE_PORT || 5432),
    database: process.env.TIMESCALE_DB,
    user: process.env.TIMESCALE_USER,
    password: process.env.TIMESCALE_PASSWORD,
    ssl: { rejectUnauthorized: false },
    max: 5,
    keepAlive: true,
  });
}

export const pool: Pool = global._pgPool ?? makePool();
if (process.env.NODE_ENV !== 'production') global._pgPool = pool;
