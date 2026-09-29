import { fetchWeekly, fetchLifetimeCreators, fetchMonthGoal, Measures } from './wbr';
import { buildTree, mondaysEndingAt } from './wbrTree';
import { BRANDS, brandBySlug } from './brands';

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
