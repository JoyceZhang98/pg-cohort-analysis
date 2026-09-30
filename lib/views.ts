import { fetchWeekly, fetchLifetimeCreators, fetchMonthGoal, Measures } from './wbr';
import { buildTree, mondaysEndingAt } from './wbrTree';
import { BRANDS, brandBySlug } from './brands';
import { pool } from './db';
import { benchmarkTier, benchmarkValue, Tier, Category } from './benchmark';

// Monday (UTC) of the week containing `d`.
function mondayOf(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dow);
  return t.toISOString().slice(0, 10);
}
const rate = (n: number, d: number) => (d ? n / d : null);

export type BrandView = {
  brand: string; slug: string; reportWeek: string; availableWeeks: string[];
  tree: ReturnType<typeof buildTree>; generatedAt: string;
};

// Full Brand Dashboard payload. Pass `series` to reuse an already-fetched weekly series.
export async function computeBrandView(
  slug: string, week: string | null, emvV = 10, emvE = 0.3, series?: Map<string, Measures>,
): Promise<BrandView | { error: string }> {
  let shopIds: string[]; let supaNames: string[]; let label: string;
  if (slug === 'all') {
    shopIds = BRANDS.map(b => b.shopId); supaNames = BRANDS.map(b => b.supaName); label = 'All P&G';
  } else {
    const b = brandBySlug(slug);
    if (!b) return { error: 'unknown brand' };
    shopIds = [b.shopId]; supaNames = [b.supaName]; label = b.label;
  }
  const s = series ?? await fetchWeekly(shopIds, supaNames);
  const currentMonday = mondayOf(new Date());
  const complete = [...s.keys()].filter(w => w < currentMonday).sort();
  if (complete.length === 0) return { error: 'no data' };
  const availableWeeks = complete.slice(-10).reverse();
  const reportWeek = week && complete.includes(week) ? week : complete[complete.length - 1];
  const [lifetime, monthGoal] = await Promise.all([
    fetchLifetimeCreators(shopIds, mondaysEndingAt(reportWeek, 13)).catch(() => ({} as Record<string, number>)),
    fetchMonthGoal(supaNames, reportWeek.slice(0, 7)),
  ]);
  const tree = buildTree(s, lifetime, reportWeek, emvV, emvE, monthGoal);
  return { brand: label, slug, reportWeek, availableWeeks, tree, generatedAt: new Date().toISOString() };
}

const EXEC_METRICS: { key: string; label: string; fmt: 'money' | 'int' | 'pct' | 'x' | 'ratio'; f: (m: Measures) => number | null }[] = [
  { key: 'gmv', label: 'GMV', fmt: 'money', f: m => m.gmv },
  { key: 'views', label: 'Video Views', fmt: 'int', f: m => m.video_views },
  { key: 'ctr', label: 'CTR', fmt: 'pct', f: m => rate(m.page_views, m.impressions) },
  { key: 'ctor', label: 'CTOR', fmt: 'pct', f: m => rate(m.orders, m.page_views) },
  { key: 'aov', label: 'AOV', fmt: 'money', f: m => rate(m.gmv, m.orders) },
  { key: 'instock', label: 'In-Stock % (Unit-Wtd)', fmt: 'pct', f: m => rate(m.instock_num, m.instock_den) },
  { key: 'roas', label: 'Ads ROAS', fmt: 'x', f: m => rate(m.ad_gmv, m.ad_spend) },
  { key: 'sps', label: 'Shop Health', fmt: 'ratio', f: m => m.sps || null },
];

export type ExecView = {
  reportWeek: string; availableWeeks: string[];
  metrics: { key: string; label: string; fmt: string }[];
  rows: { brand: string; cells: { key: string; label: string; fmt: string; value: number | null; delta: number | null; deltaKind: string }[] }[];
  generatedAt: string;
};

// Executive Summary payload. Pass `prefetched` (slug → series) to reuse already-fetched series.
export async function computeExecView(
  week: string | null, prefetched?: Record<string, Map<string, Measures>>,
): Promise<ExecView | { error: string }> {
  const perBrand = prefetched && BRANDS.every(b => prefetched[b.slug])
    ? BRANDS.map(b => ({ b, series: prefetched[b.slug] }))
    : await Promise.all(BRANDS.map(async b => ({ b, series: await fetchWeekly([b.shopId], [b.supaName]) })));
  const currentMonday = mondayOf(new Date());
  const allWeeks = new Set<string>();
  perBrand.forEach(x => x.series.forEach((_v, k) => { if (k < currentMonday) allWeeks.add(k); }));
  const complete = [...allWeeks].sort();
  if (!complete.length) return { error: 'no data' };
  const reportWeek = week && complete.includes(week) ? week : complete[complete.length - 1];
  const prevWeek = complete[complete.indexOf(reportWeek) - 1] ?? null;

  const rowFor = (series: Map<string, Measures>) => {
    const cur = series.get(reportWeek);
    const prev = prevWeek ? series.get(prevWeek) : undefined;
    return EXEC_METRICS.map(mt => {
      const v = cur ? mt.f(cur) : null;
      const pv = prev ? mt.f(prev) : null;
      let delta: number | null = null, deltaKind: 'pct' | 'pp' = 'pct';
      if (v !== null && pv !== null) {
        if (mt.fmt === 'pct') { delta = v - pv; deltaKind = 'pp'; }
        else { delta = pv !== 0 ? (v - pv) / Math.abs(pv) : null; deltaKind = 'pct'; }
      }
      return { key: mt.key, label: mt.label, fmt: mt.fmt, value: v, delta, deltaKind };
    });
  };

  const brandRows = perBrand.map(x => ({ brand: x.b.label, cells: rowFor(x.series) }));
  const totalSeries = new Map<string, Measures>();
  perBrand.forEach(x => x.series.forEach((m, k) => {
    const acc = totalSeries.get(k);
    if (!acc) totalSeries.set(k, { ...m });
    else (Object.keys(m) as (keyof Measures)[]).forEach(f => { acc[f] += m[f]; });
  }));
  const totalRow = { brand: 'TOTAL / WEIGHTED', cells: rowFor(totalSeries) };
  const spsVals = perBrand.map(x => x.series.get(reportWeek)?.sps).filter((v): v is number => !!v && v > 0);
  const spsCell = totalRow.cells.find(c => c.key === 'sps');
  if (spsCell) { spsCell.value = spsVals.length ? spsVals.reduce((a, b) => a + b, 0) / spsVals.length : null; spsCell.delta = null; }

  return {
    reportWeek, availableWeeks: complete.slice(-10).reverse(),
    metrics: EXEC_METRICS.map(m => ({ key: m.key, label: m.label, fmt: m.fmt })),
    rows: [...brandRows, totalRow], generatedAt: new Date().toISOString(),
  };
}

// ---------- Benchmark view (TrendVision-style: ACTUAL vs category×tier benchmark) ----------
export type BenchmarkRow = {
  measure: string; fmt: 'money' | 'int' | 'pct' | 'ratio'; inverse: boolean;
  actual: number | null; benchmark: number | null; gap: number | null; attainment: number | null;
};
export type BenchmarkView = {
  brand: string; slug: string; category: Category; tier: Tier;
  lastMonthGmv: number; lastMonthLabel: string; rows: BenchmarkRow[]; generatedAt: string;
};

type BAgg = {
  gmv: number; orders: number; pv: number; impr: number; aff_gmv: number;
  creator: number; seller: number; ad_spend: number; samples: number;
  cart_adds: number; cart_orders: number; last_month_gmv: number;
};

const num = (x: unknown) => Number(x) || 0;

// Rolling-30-day (L30D) actuals for one shop, resilient to a slow/locked query (allSettled).
async function fetchBenchmarkActuals(shopId: string): Promise<BAgg> {
  const s = [shopId];
  const L30 = `current_date - interval '30 days'`;
  const settled = await Promise.allSettled([
    pool.query(`select coalesce(sum(psd.gmv),0) gmv, coalesce(sum(psd.orders),0) orders,
        coalesce(sum(psd.page_views),0) pv, coalesce(sum(psd.impressions),0) impr
      from product_stat_rich_daily psd join product p on p.id=psd.product_id
      where p.shop_id=any($1) and psd.date >= ${L30}`, [s]),
    pool.query(`select count(*) filter (where affiliate_id is not null) creator,
        count(*) filter (where affiliate_id is null) seller
      from video where shop_id=any($1) and video_post_time >= ${L30}`, [s]),
    pool.query(`select coalesce(sum(price_amount*coalesce(quantity,1)),0) aff_gmv
      from affiliate_order where shop_id=any($1) and create_time >= ${L30}`, [s]),
    pool.query(`select coalesce(sum(gs.cost),0) ad_spend
      from gmv_max_campaign_stat_daily gs join gmv_max_campaign gc on gc.id=gs.campaign_id
      where gc.shop_id=any($1) and gs.date >= ${L30}`, [s]),
    pool.query(`select count(distinct sa.sample_id) samples
      from sample_activity sa join sample sm on sm.id=sa.sample_id
      where sm.shop_id=any($1) and sa.new_status='SHIPPED' and to_timestamp(sa.event_timestamp) >= ${L30}`, [s]),
    pool.query(`select coalesce(sum(ps.add_to_cart_count),0) cart_adds, coalesce(sum(ps.sku_orders),0) cart_orders
      from product_live_stat_rich_daily ps join product p on p.id=ps.product_id
      where p.shop_id=any($1) and ps.date >= ${L30}`, [s]),
    // last full calendar month GMV → drives the benchmark tier
    pool.query(`select coalesce(sum(psd.gmv),0) g from product_stat_rich_daily psd join product p on p.id=psd.product_id
      where p.shop_id=any($1) and psd.date >= date_trunc('month', current_date) - interval '1 month'
        and psd.date < date_trunc('month', current_date)`, [s]),
  ]);
  settled.forEach((x, i) => { if (x.status === 'rejected') console.error(`[benchmark] actual query #${i} failed:`, (x.reason as Error)?.message); });
  const r = settled.map(x => (x.status === 'fulfilled' ? x.value.rows[0] : {}) as Record<string, unknown>);
  return {
    gmv: num(r[0].gmv), orders: num(r[0].orders), pv: num(r[0].pv), impr: num(r[0].impr),
    creator: num(r[1].creator), seller: num(r[1].seller), aff_gmv: num(r[2].aff_gmv),
    ad_spend: num(r[3].ad_spend), samples: num(r[4].samples),
    cart_adds: num(r[5].cart_adds), cart_orders: num(r[5].cart_orders), last_month_gmv: num(r[6].g),
  };
}

const rate2 = (n: number, d: number) => (d ? n / d : null);
const BM_MEASURES: { measure: string; fmt: 'money' | 'int' | 'pct' | 'ratio'; inverse?: boolean; f: (a: BAgg) => number | null }[] = [
  { measure: 'GMV (L30D)', fmt: 'money', f: a => a.gmv },
  { measure: 'Hero Products', fmt: 'int', f: () => null }, // filled from a separate rolling-30d hero query below
  { measure: 'Seller Contents', fmt: 'int', f: a => a.seller },
  { measure: 'Affiliate GMV%', fmt: 'pct', f: a => rate2(a.aff_gmv, a.gmv) },
  { measure: 'Creator Contents', fmt: 'int', f: a => a.creator },
  { measure: 'Product CTR', fmt: 'pct', f: a => rate2(a.pv, a.impr) },
  { measure: 'C_O (SKU Order)', fmt: 'pct', f: a => rate2(a.orders, a.pv) }, // click→order (benchmark ~2-3%, matches this not cart→order)
  { measure: 'Free Samples Delivered', fmt: 'int', f: a => a.samples },
  { measure: 'Ads Investment', fmt: 'money', f: a => a.ad_spend },
  { measure: 'Ads % GMV', fmt: 'pct', inverse: true, f: a => rate2(a.ad_spend, a.gmv) },
];

async function fetchHero30d(shopId: string): Promise<number | null> {
  try {
    const { rows } = await pool.query<{ hero: string }>(
      `select count(*) hero from (
         select psd.product_id from product_stat_rich_daily psd join product p on p.id=psd.product_id
         where p.shop_id=$1 and psd.date >= current_date - interval '30 days'
         group by psd.product_id having sum(psd.gmv) >= 30000 or sum(psd.orders) >= 1000) h`, [shopId]);
    return num(rows[0]?.hero);
  } catch { return null; }
}

export async function computeBenchmarkView(slug: string): Promise<BenchmarkView | { error: string }> {
  const b = brandBySlug(slug);
  if (!b) return { error: 'unknown brand' };
  const [agg, hero] = await Promise.all([fetchBenchmarkActuals(b.shopId), fetchHero30d(b.shopId)]);
  const tier = benchmarkTier(b.category, agg.last_month_gmv);
  const lastMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1));
  const lastMonthLabel = lastMonth.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

  const rows: BenchmarkRow[] = BM_MEASURES.map(m => {
    const actual = m.measure === 'Hero Products' ? hero : m.f(agg);
    const benchmark = benchmarkValue(b.category, m.measure, tier);
    const gap = actual !== null && benchmark !== null ? actual - benchmark : null;
    const attainment = actual !== null && benchmark ? actual / benchmark : null;
    return { measure: m.measure, fmt: m.fmt, inverse: !!m.inverse, actual, benchmark, gap, attainment };
  });

  return {
    brand: b.label, slug, category: b.category, tier,
    lastMonthGmv: agg.last_month_gmv, lastMonthLabel, rows, generatedAt: new Date().toISOString(),
  };
}
