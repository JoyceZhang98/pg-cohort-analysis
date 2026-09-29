// Supabase access over the REST API (HTTPS/443) — reachable from Vercel serverless,
// unlike the DB pooler (IPv6/IPv4 issues). Best-effort: returns null if not configured.
const URL_ = () => process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const KEY_ = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export function supaConfigured(): boolean {
  return !!(URL_() && KEY_());
}

// Call a Postgres function via PostgREST: POST /rest/v1/rpc/<fn>. Throws on HTTP error.
export async function supaRpc<T = unknown>(fn: string, body: Record<string, unknown>): Promise<T> {
  const url = URL_().replace(/\/$/, '');
  const key = KEY_();
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) throw new Error(`rpc ${fn} ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return res.json() as Promise<T>;
}
