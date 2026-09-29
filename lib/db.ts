import { Pool } from 'pg';

// Single shared pool across hot reloads / lambda invocations.
declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

function makePool() {
  // Support either a single connection string or discrete TIMESCALE_* vars.
  // statement_timeout: no single query may exceed 30s — a pathological query aborts and
  // returns blank for its section instead of hanging (and piling up) the whole report.
  const common = {
    ssl: { rejectUnauthorized: false },
    max: 5,
    keepAlive: true,
    application_name: 'pg-wbr',
    statement_timeout: 30_000,
  };
  if (process.env.DATABASE_URL) {
    return new Pool({ connectionString: process.env.DATABASE_URL, ...common });
  }
  return new Pool({
    host: process.env.TIMESCALE_HOST,
    port: Number(process.env.TIMESCALE_PORT || 5432),
    database: process.env.TIMESCALE_DB,
    user: process.env.TIMESCALE_USER,
    password: process.env.TIMESCALE_PASSWORD,
    ...common,
  });
}

export const pool: Pool = global._pgPool ?? makePool();
if (process.env.NODE_ENV !== 'production') global._pgPool = pool;
