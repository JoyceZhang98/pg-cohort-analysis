import { NextRequest, NextResponse } from 'next/server';
import { fetchWeekly, Measures } from '@/lib/wbr';
import { BRANDS } from '@/lib/brands';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function mondayOf(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dow);
  return t.toISOString().slice(0, 10);
}
const rate = (n: number, d: number) => (d ? n / d : null);

const METRICS: { key: string; label: string; fmt: 'money' | 'int' | 'pct' | 'x'; f: (m: Measures) => number | null }[] = [
  { key: 'gmv', label: 'GMV', fmt: 'money', f: m => m.gmv },
  { key: 'views', label: 'Video Views', fmt: 'int', f: m => m.video_views },
  { key: 'ctr', label: 'CTR', fmt: 'pct', f: m => rate(m.page_views, m.impressions) },
  { key: 'ctor', label: 'CTOR', fmt: 'pct', f: m => rate(m.orders, m.page_views) },
  { key: 'aov', label: 'AOV', fmt: 'money', f: m => rate(m.gmv, m.orders) },
  { key: 'instock', label: 'In-Stock % (Sales-Wtd)', fmt: 'pct', f: m => rate(m.instock_num, m.instock_den) },
  { key: 'roas', label: 'Ads ROAS', fmt: 'x', f: m => rate(m.ad_gmv, m.ad_spend) },
];

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  try {
    const perBrand = await Promise.all(BRANDS.map(async b => ({ b, series: await fetchWeekly([b.shopId]) })));
    const currentMonday = mondayOf(new Date());
    const allWeeks = new Set<string>();
    perBrand.forEach(x => x.series.forEach((_v, k) => { if (k < currentMonday) allWeeks.add(k); }));
    const complete = [...allWeeks].sort();
    if (!complete.length) return NextResponse.json({ error: 'no data' }, { status: 200 });
    const reportWeek = p.get('week') && complete.includes(p.get('week')!) ? p.get('week')! : complete[complete.length - 1];
    const prevWeek = complete[complete.indexOf(reportWeek) - 1] ?? null;

    const rowFor = (series: Map<string, Measures>) => {
      const cur = series.get(reportWeek);
      const prev = prevWeek ? series.get(prevWeek) : undefined;
      return METRICS.map(mt => {
        const v = cur ? mt.f(cur) : null;
        const pv = prev ? mt.f(prev) : null;
        let delta: number | null = null, deltaKind: 'pct' | 'pp' | 'pt' = 'pct';
        if (v !== null && pv !== null) {
          if (mt.fmt === 'pct') { delta = v - pv; deltaKind = 'pp'; }
          else { delta = pv !== 0 ? (v - pv) / Math.abs(pv) : null; deltaKind = 'pct'; }
        }
        return { key: mt.key, label: mt.label, fmt: mt.fmt, value: v, delta, deltaKind };
      });
    };

    const brandRows = perBrand.map(x => ({ brand: x.b.label, cells: rowFor(x.series) }));
    // TOTAL / WEIGHTED = sum of all brand series, week by week
    const totalSeries = new Map<string, Measures>();
    perBrand.forEach(x => x.series.forEach((m, k) => {
      const acc = totalSeries.get(k);
      if (!acc) totalSeries.set(k, { ...m });
      else (Object.keys(m) as (keyof Measures)[]).forEach(f => { acc[f] += m[f]; });
    }));
    const totalRow = { brand: 'TOTAL / WEIGHTED', cells: rowFor(totalSeries) };

    return NextResponse.json({
      reportWeek, availableWeeks: complete.slice(-10).reverse(),
      metrics: METRICS.map(m => ({ key: m.key, label: m.label, fmt: m.fmt })),
      rows: [...brandRows, totalRow], generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 500 });
  }
}
