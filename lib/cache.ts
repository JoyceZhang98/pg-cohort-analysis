// Snapshot cache over Supabase (table public.wbr_cache), read/written via PostgREST with the
// service-role key. The daily cron precomputes views and cacheSet()s them; API routes cacheGet()
// them for instant loads. All best-effort: any failure returns null so callers fall back to live.
const URL_ = () => (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const KEY_ = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ready = () => !!(URL_() && KEY_());

// Snapshots live in one shared Supabase table, so each dashboard (brand set) namespaces its keys to
// avoid clobbering another's 'all' / 'exec' snapshots. Default P&G keeps bare keys (unchanged); any
// other workspace (e.g. coco-eve) prefixes every key with its id.
const NS = (process.env.NEXT_PUBLIC_BRAND_SET || 'png').toLowerCase();
const nsKey = (key: string) => (NS === 'png' ? key : `${NS}:${key}`);

export async function cacheGet<T = unknown>(key: string): Promise<{ payload: T; updatedAt: string } | null> {
  if (!ready()) return null;
  try {
    const res = await fetch(
      `${URL_()}/rest/v1/wbr_cache?cache_key=eq.${encodeURIComponent(nsKey(key))}&select=payload,updated_at`,
      { headers: { apikey: KEY_(), Authorization: `Bearer ${KEY_()}` }, signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as { payload: T; updated_at: string }[];
    return rows?.[0] ? { payload: rows[0].payload, updatedAt: rows[0].updated_at } : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, payload: unknown): Promise<boolean> {
  if (!ready()) return false;
  try {
    const res = await fetch(`${URL_()}/rest/v1/wbr_cache?on_conflict=cache_key`, {
      method: 'POST',
      headers: {
        apikey: KEY_(), Authorization: `Bearer ${KEY_()}`,
        'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ cache_key: nsKey(key), payload, updated_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
