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
const pctD = (a: number, b: number) => (b ? (a - b) / Math.abs(b) : null);

type Agg = { product: string; image: string | null; cost: number; revenue: number; orders: number };

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const brand = p.get('brand') || 'all';
  const shopIds = brand === 'all' ? BRANDS.map(b => b.shopId) : (brandBySlug(brand) ? [brandBySlug(brand)!.shopId] : null);
  if (!shopIds) return NextResponse.json({ error: 'unknown brand' }, { status: 400 });

  const end = p.get('week') ? addDays(p.get('week')!, 7) : mondayOf(new Date());
  const start = addDays(end, -28);
  const prevStart = addDays(end, -56);

  const q = (from: string, to: string) => pool.query<Agg & { product_id: string }>(
    `select g.product_id, coalesce(p.title, '(unknown product)') product, p.main_image_url image,
       round(sum(g.cost))::int cost, round(sum(g.gross_revenue))::int revenue, sum(g.orders)::int orders
     from gmv_max_product_stat_daily g
     join gmv_max_campaign gc on gc.id = g.campaign_id
     left join product p on p.id = g.product_id
     where gc.shop_id = any($1) and g.date >= $2 and g.date < $3
     group by g.product_id, p.title, p.main_image_url
     having sum(g.cost) > 0`, [shopIds, from, to]);

  try {
    const [cur, prev] = await Promise.all([q(start, end), q(prevStart, start)]);
    const prevMap = new Map(prev.rows.map(r => [r.product_id, r]));
    const rows = cur.rows
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 30)
      .map(r => {
        const pv = prevMap.get(r.product_id);
        const roi = r.cost ? r.revenue / r.cost : null;
        const cpo = r.orders ? r.cost / r.orders : null;
        const aov = r.orders ? r.revenue / r.orders : null;
        const pRoi = pv && pv.cost ? pv.revenue / pv.cost : null;
        const pCpo = pv && pv.orders ? pv.cost / pv.orders : null;
        const pAov = pv && pv.orders ? pv.revenue / pv.orders : null;
        return {
          product: r.product, image: r.image,
          cost: r.cost, costPct: pv ? pctD(r.cost, pv.cost) : null,
          revenue: r.revenue, revenuePct: pv ? pctD(r.revenue, pv.revenue) : null,
          roi, roiPct: roi !== null && pRoi !== null ? pctD(roi, pRoi) : null,
          orders: r.orders, ordersPct: pv ? pctD(r.orders, pv.orders) : null,
          cpo, cpoPct: cpo !== null && pCpo !== null ? pctD(cpo, pCpo) : null,
          aov, aovPct: aov !== null && pAov !== null ? pctD(aov, pAov) : null,
        };
      });
    const totals = cur.rows.reduce((a, r) => ({ cost: a.cost + r.cost, revenue: a.revenue + r.revenue, orders: a.orders + r.orders }), { cost: 0, revenue: 0, orders: 0 });
    return NextResponse.json({ brand, start, end: addDays(end, -1), count: cur.rows.length, totals, rows, generatedAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 500 });
  }
}
