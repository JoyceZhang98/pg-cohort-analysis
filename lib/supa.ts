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

// Distinct L3+ creator handles (normalized: lowercase, no leading @) for the given brand names,
// from daily_newvideo_creatorlevel over the trailing ~16 weeks. Best-effort: [] on failure.
// These match TimescaleDB affiliate.username ~99%, so we can attribute L3+ views/creators there.
export async function supaL3Handles(names: string[]): Promise<string[]> {
  if (!supaConfigured() || !names.length) return [];
  try {
    const url = URL_().replace(/\/$/, '');
    const key = KEY_();
    const inList = names.map(n => `"${n.replace(/"/g, '')}"`).join(',');
    const res = await fetch(
      `${url}/rest/v1/daily_newvideo_creatorlevel?brand_name=in.(${encodeURIComponent(inList)})` +
      `&creator_level=in.(L3,L4,L5,L6,L6+)&post_time=gte.${new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10)}` +
      `&select=creator_handle`,
      { headers: { apikey: key, Authorization: `Bearer ${key}`, Range: '0-49999' }, signal: AbortSignal.timeout(9000) },
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as { creator_handle: string }[];
    return [...new Set(rows.map(r => (r.creator_handle || '').toLowerCase().replace(/^@/, '').trim()).filter(Boolean))];
  } catch {
    return [];
  }
}
