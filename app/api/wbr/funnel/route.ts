import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { BRANDS, brandBySlug } from '@/lib/brands';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function mondayOf(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dow);
  return t.toISOString().slice(0, 10);
}
const addDays = (iso: string, n: number) => new Date(new Date(iso + 'T00:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);
const pct = (a: number, b: number) => (b ? (a - b) / Math.abs(b) : null);

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const brand = p.get('brand') || 'all';
  const shopIds = brand === 'all' ? BRANDS.map(b => b.shopId) : (brandBySlug(brand) ? [brandBySlug(brand)!.shopId] : null);
  if (!shopIds) return NextResponse.json({ error: 'unknown brand' }, { status: 400 });

  const end = p.get('week') ? addDays(p.get('week')!, 7) : mondayOf(new Date());
  const start = addDays(end, -28);
  const prevStart = addDays(end, -56);
  const s = shopIds;

  try {
    const [reached, req_, appr, awaiting, posted, sales] = await Promise.all([
      pool.query(`select
        count(distinct tcc.affiliate_id) filter (where tcc.created_at >= $2 and tcc.created_at < $3) cur,
        count(distinct tcc.affiliate_id) filter (where tcc.created_at >= $4 and tcc.created_at < $2) prev
        from target_collaboration_creator tcc join target_collaboration tc on tc.id = tcc.target_collaboration_id
        where tc.shop_id = any($1)`, [s, start, end, prevStart]),
      pool.query(`select
        count(distinct affiliate_id) filter (where created_at >= $2 and created_at < $3) cur,
        count(distinct affiliate_id) filter (where created_at >= $4 and created_at < $2) prev
        from sample where shop_id = any($1)`, [s, start, end, prevStart]),
      pool.query(`select
        count(distinct sm.affiliate_id) filter (where to_timestamp(sa.event_timestamp) >= $2 and to_timestamp(sa.event_timestamp) < $3) cur,
        count(distinct sm.affiliate_id) filter (where to_timestamp(sa.event_timestamp) >= $4 and to_timestamp(sa.event_timestamp) < $2) prev
        from sample_activity sa join sample sm on sm.id = sa.sample_id
        where sm.shop_id = any($1) and sa.new_status = 'AWAITING_SHIPMENT'`, [s, start, end, prevStart]),
      pool.query(`select count(distinct affiliate_id) cur from sample where shop_id = any($1) and status = 'CONTENT_PENDING'`, [s]),
      pool.query(`select
        count(distinct affiliate_id) filter (where video_post_time >= $2 and video_post_time < $3) cur,
        count(distinct affiliate_id) filter (where video_post_time >= $4 and video_post_time < $2) prev
        from video where shop_id = any($1) and affiliate_id is not null`, [s, start, end, prevStart]),
      pool.query(`select
        count(distinct affiliate_id) filter (where create_time >= $2 and create_time < $3) cur,
        count(distinct affiliate_id) filter (where create_time >= $4 and create_time < $2) prev
        from affiliate_order where shop_id = any($1)`, [s, start, end, prevStart]),
    ]);
    const N = (r: any, k = 'cur') => Number(r.rows[0]?.[k]) || 0;
    const stage = (label: string, sub: string, r: any, snapshot = false) => ({
      label, sub,
      value: N(r), pct: snapshot ? null : pct(N(r), N(r, 'prev')),
    });

    const stages = [
      stage('Creators Reached', `${start} – ${addDays(end, -1)}`, reached),
      stage('Creators with new sample requests', `${start} – ${addDays(end, -1)}`, req_),
      stage('Creators with approved samples', `${start} – ${addDays(end, -1)}`, appr),
      stage('Creators awaiting content', 'Currently content pending', awaiting, true),
      stage('Creators who posted', `${start} – ${addDays(end, -1)}`, posted),
      stage('Creators with sales', `${start} – ${addDays(end, -1)}`, sales),
    ];
    return NextResponse.json({ brand, start, end: addDays(end, -1), stages, generatedAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 500 });
  }
}
