import { Measures, sumWeeks } from './wbr';

export type Fmt = 'money' | 'int' | 'pct' | 'x' | 'ratio';
export type Row = {
  label: string;
  fmt: Fmt;
  inverse?: boolean;      // lower is better (color flip)
  weekly: (number | null)[]; // trailing-5 values
  wowAbs: number | null;
  wowPct: number | null;
  mtd: number | null;
  momPct: number | null;
};
export type Group = { name: string; rows: Row[] };
export type Tree = { weeks: string[]; groups: Group[]; reportWeek: string };

type Kind = 'flow' | 'rate' | 'snapshot';
type Def = {
  label: string; fmt: Fmt; kind: Kind; inverse?: boolean;
  value: (m: Measures, emvV: number, emvE: number, lifetime: number) => number | null;
};

const rate = (num: number, den: number) => (den ? num / den : null);

const DEFS: { group: string; items: Def[] }[] = [
  {
    group: 'HEADLINE',
    items: [
      { label: 'GMV with Subsidies', fmt: 'money', kind: 'flow', value: m => m.gmv + m.subsidy },
      { label: 'GMV', fmt: 'money', kind: 'flow', value: m => m.gmv },
      { label: 'Affiliate GMV', fmt: 'money', kind: 'flow', value: m => m.affiliate_gmv },
      { label: 'Ads Take Rate (Ad GMV / Total GMV)', fmt: 'pct', kind: 'rate', value: m => rate(m.ad_gmv, m.gmv) },
      { label: 'Subsidy Rate', fmt: 'pct', kind: 'rate', inverse: true, value: m => rate(m.subsidy, m.gmv + m.subsidy) },
      { label: 'GPM (GMV per 1,000 views)', fmt: 'money', kind: 'rate', value: m => rate(m.gmv, m.video_views) === null ? null : (m.gmv / m.video_views) * 1000 },
      { label: 'Ads ROAS (Ads GMV / Ad Spend)', fmt: 'x', kind: 'rate', value: m => rate(m.ad_gmv, m.ad_spend) },
      { label: 'EMV (Earned Media Value)', fmt: 'money', kind: 'flow', value: (m, ev, ee) => (m.video_views / 1000) * ev + ((m.likes + m.comments + m.shares) / 1000) * ee },
      { label: 'Active Creators (Creators Posting)', fmt: 'int', kind: 'flow', value: m => m.active_creators },
      { label: 'Lifetime Creators', fmt: 'int', kind: 'snapshot', value: (_m, _v, _e, lifetime) => lifetime },
      { label: 'Total Customers', fmt: 'int', kind: 'flow', value: m => m.customers },
    ],
  },
  {
    group: 'AWARENESS — are we getting enough exposure?',
    items: [
      { label: 'Impressions', fmt: 'int', kind: 'flow', value: m => m.impressions },
      { label: 'Video Views', fmt: 'int', kind: 'flow', value: m => m.video_views },
      { label: 'Total Page Views', fmt: 'int', kind: 'flow', value: m => m.page_views },
      { label: 'New Affiliate Videos', fmt: 'int', kind: 'flow', value: m => m.new_videos },
      { label: 'Avg Views per Affiliate Video', fmt: 'int', kind: 'rate', value: m => rate(m.video_views, m.new_videos) },
    ],
  },
  {
    group: 'CONVERSION — is the traffic converting?',
    items: [
      { label: 'Orders', fmt: 'int', kind: 'flow', value: m => m.orders },
      { label: 'CTR (PV / Impressions)', fmt: 'pct', kind: 'rate', value: m => rate(m.page_views, m.impressions) },
      { label: 'CTOR (Orders / PV)', fmt: 'pct', kind: 'rate', value: m => rate(m.orders, m.page_views) },
      { label: 'Orders per 1,000 Views', fmt: 'ratio', kind: 'rate', value: m => rate(m.orders, m.video_views) === null ? null : (m.orders / m.video_views) * 1000 },
    ],
  },
  {
    group: 'AVERAGE ORDER VALUE',
    items: [
      { label: 'AOV (GMV / Orders)', fmt: 'money', kind: 'rate', value: m => rate(m.gmv, m.orders) },
      { label: 'Units Sold', fmt: 'int', kind: 'flow', value: m => m.units },
      { label: 'Units per Order', fmt: 'ratio', kind: 'rate', value: m => rate(m.units, m.orders) },
      { label: 'Refund GMV', fmt: 'money', kind: 'flow', inverse: true, value: m => m.refund_gmv },
      { label: 'Refund Rate (% of GMV)', fmt: 'pct', kind: 'rate', inverse: true, value: m => rate(m.refund_gmv, m.gmv) },
      { label: 'Sales-Weighted In-Stock Rate', fmt: 'pct', kind: 'rate', value: m => rate(m.instock_num, m.instock_den) },
    ],
  },
  {
    group: 'AVAILABILITY — can we actually fulfil the demand?',
    items: [
      { label: 'Late Dispatch Rate', fmt: 'pct', kind: 'rate', inverse: true, value: m => rate(m.late_orders, m.order_rows) },
      { label: 'SKUs Live', fmt: 'int', kind: 'snapshot', value: m => m.skus_live },
      { label: 'SKUs Out of Stock', fmt: 'int', kind: 'snapshot', inverse: true, value: m => m.skus_oos },
    ],
  },
  {
    group: 'INTERNAL OPERATIONS VIEW — sample funnel',
    items: [
      { label: 'Samples Applied', fmt: 'int', kind: 'flow', value: m => m.samples_applied },
      { label: 'Samples Approved', fmt: 'int', kind: 'flow', value: m => m.samples_approved },
      { label: 'Samples Sent (Delivered)', fmt: 'int', kind: 'flow', value: m => m.samples_delivered },
    ],
  },
];

// generate `count` Monday keys ending at (and including) reportWeek, oldest first
export function mondaysEndingAt(reportWeek: string, count: number): string[] {
  const out: string[] = [];
  const d = new Date(reportWeek + 'T00:00:00Z');
  for (let i = count - 1; i >= 0; i--) {
    const x = new Date(d.getTime() - i * 7 * 864e5);
    out.push(x.toISOString().slice(0, 10));
  }
  return out;
}
const monthOf = (mondayKey: string) => mondayKey.slice(0, 7);

export function buildTree(
  series: Map<string, Measures>,
  lifetimeByWeek: Record<string, number>,
  reportWeek: string,
  emvV: number,
  emvE: number,
): Tree {
  const trailing = mondaysEndingAt(reportWeek, 5);
  const span = mondaysEndingAt(reportWeek, 13); // for month bucketing
  const repMonth = monthOf(reportWeek);
  const priorMonth = monthOf(mondaysEndingAt(reportWeek, 6)[0]); // ~5 weeks back → prior month label
  const mtdWeeks = span.filter(w => monthOf(w) === repMonth && w <= reportWeek);
  const priorWeeks = span.filter(w => monthOf(w) === priorMonth);

  const periodValue = (def: Def, weeks: string[]): number | null => {
    if (weeks.length === 0) return null;
    const last = weeks[weeks.length - 1];
    if (def.kind === 'snapshot') {
      const m = series.get(last);
      return m ? def.value(m, emvV, emvE, lifetimeByWeek[last] ?? 0) : null;
    }
    const agg = sumWeeks(series, weeks);
    return def.value(agg, emvV, emvE, lifetimeByWeek[last] ?? 0);
  };
  const weekValue = (def: Def, wk: string): number | null => {
    const m = series.get(wk);
    if (!m && def.kind !== 'snapshot') return null;
    return def.value(m ?? ({} as Measures), emvV, emvE, lifetimeByWeek[wk] ?? 0);
  };

  const groups: Group[] = DEFS.map(g => ({
    name: g.group,
    rows: g.items.map(def => {
      const weekly = trailing.map(w => (series.has(w) || def.kind === 'snapshot' ? weekValue(def, w) : null));
      const cur = weekly[weekly.length - 1];
      const prev = weekly[weekly.length - 2];
      const mtd = periodValue(def, mtdWeeks);
      const prior = periodValue(def, priorWeeks);
      const pctDelta = (a: number | null, b: number | null) =>
        a === null || b === null || b === 0 ? null : (a - b) / Math.abs(b);
      return {
        label: def.label,
        fmt: def.fmt,
        inverse: def.inverse,
        weekly,
        wowAbs: cur !== null && prev !== null ? cur - prev : null,
        wowPct: pctDelta(cur, prev),
        mtd,
        momPct: pctDelta(mtd, prior),
      };
    }),
  }));

  return { weeks: trailing, groups, reportWeek };
}
