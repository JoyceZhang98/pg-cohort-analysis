import { Measures, sumWeeks } from './wbr';

export type Fmt = 'money' | 'int' | 'pct' | 'x' | 'ratio';
export type Row = {
  label: string;
  fmt: Fmt;
  inverse?: boolean;
  weekly: (number | null)[];
  wowAbs: number | null;
  wowPct: number | null;
  mtd: number | null;
  prior: number | null;   // prior-full-month absolute value
  momPct: number | null;
  children?: Row[]; // raw components behind a ratio / composite (drill-down)
};
export type Group = { name: string; rows: Row[] };
export type Driver = { driver: string; fmt: Fmt; thisWeek: number | null; lastWeek: number | null; wowAbs: number | null; wowPct: number | null; logDelta: number | null };
export type Tree = {
  weeks: string[]; groups: Group[]; reportWeek: string;
  months: { mtd: string; prior: string };
  drivers: { rows: Driver[]; biggest: number };
};

type Kind = 'flow' | 'rate' | 'snapshot';
type ValFn = (m: Measures, emvV: number, emvE: number, lifetime: number) => number | null;
type Child = { label: string; fmt: Fmt; value: ValFn };
type Def = { label: string; fmt: Fmt; kind: Kind; inverse?: boolean; value: ValFn; children?: Child[] };

const rate = (num: number, den: number) => (den ? num / den : null);
// component shorthands (all flows)
const c = (label: string, fmt: Fmt, value: ValFn): Child => ({ label, fmt, value });

const DEFS: { group: string; items: Def[] }[] = [
  {
    group: 'HEADLINE',
    items: [
      { label: 'GMV with Subsidies', fmt: 'money', kind: 'flow', value: m => m.gmv + m.subsidy,
        children: [c('GMV', 'money', m => m.gmv), c('Subsidy $', 'money', m => m.subsidy)] },
      { label: 'GMV', fmt: 'money', kind: 'flow', value: m => m.gmv,
        children: [c('Video GMV', 'money', m => m.video_gmv), c('Live GMV', 'money', m => m.live_gmv), c('Product-Card GMV', 'money', m => m.card_gmv)] },
      { label: 'Affiliate GMV', fmt: 'money', kind: 'flow', value: m => m.affiliate_gmv },
      { label: 'Ads Take Rate (Ad GMV / Total GMV)', fmt: 'pct', kind: 'rate', value: m => rate(m.ad_gmv, m.gmv),
        children: [c('Ad GMV', 'money', m => m.ad_gmv), c('Total GMV', 'money', m => m.gmv)] },
      { label: 'Subsidy Rate', fmt: 'pct', kind: 'rate', inverse: true, value: m => rate(m.subsidy, m.gmv + m.subsidy),
        children: [c('Subsidy $', 'money', m => m.subsidy), c('GMV with Subsidies', 'money', m => m.gmv + m.subsidy)] },
      { label: 'GPM (GMV per 1,000 views)', fmt: 'money', kind: 'rate', value: m => (m.video_views ? (m.gmv / m.video_views) * 1000 : null),
        children: [c('GMV', 'money', m => m.gmv), c('Video Views', 'int', m => m.video_views)] },
      { label: 'Ads ROAS (Ads GMV / Ad Spend)', fmt: 'x', kind: 'rate', value: m => rate(m.ad_gmv, m.ad_spend),
        children: [c('Ad GMV', 'money', m => m.ad_gmv), c('Ad Spend', 'money', m => m.ad_spend)] },
      { label: 'EMV (Earned Media Value)', fmt: 'money', kind: 'flow', value: (m, ev, ee) => (m.video_views / 1000) * ev + (m.likes + m.comments + m.shares) * ee,
        children: [
          c('Video Views', 'int', m => m.video_views),
          c('Engagements (Likes+Comments+Shares)', 'int', m => m.likes + m.comments + m.shares),
          c('Views $ component', 'money', (m, ev) => (m.video_views / 1000) * ev),
          c('Engagement $ component', 'money', (m, _ev, ee) => (m.likes + m.comments + m.shares) * ee),
        ] },
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
      { label: 'Avg Views per Affiliate Video', fmt: 'int', kind: 'rate', value: m => rate(m.video_views, m.new_videos),
        children: [c('Video Views', 'int', m => m.video_views), c('New Affiliate Videos', 'int', m => m.new_videos)] },
    ],
  },
  {
    group: 'CONVERSION — is the traffic converting?',
    items: [
      { label: 'Orders', fmt: 'int', kind: 'flow', value: m => m.orders },
      { label: 'CTR (PV / Impressions)', fmt: 'pct', kind: 'rate', value: m => rate(m.page_views, m.impressions),
        children: [c('Total Page Views', 'int', m => m.page_views), c('Impressions', 'int', m => m.impressions)] },
      { label: 'CTOR (Orders / PV)', fmt: 'pct', kind: 'rate', value: m => rate(m.orders, m.page_views),
        children: [c('Orders', 'int', m => m.orders), c('Total Page Views', 'int', m => m.page_views)] },
      { label: 'Orders per 1,000 Views', fmt: 'ratio', kind: 'rate', value: m => (m.video_views ? (m.orders / m.video_views) * 1000 : null),
        children: [c('Orders', 'int', m => m.orders), c('Video Views', 'int', m => m.video_views)] },
    ],
  },
  {
    group: 'AVERAGE ORDER VALUE',
    items: [
      { label: 'AOV (GMV / Orders)', fmt: 'money', kind: 'rate', value: m => rate(m.gmv, m.orders),
        children: [c('GMV', 'money', m => m.gmv), c('Orders', 'int', m => m.orders)] },
      { label: 'Units Sold', fmt: 'int', kind: 'flow', value: m => m.units },
      { label: 'Units per Order', fmt: 'ratio', kind: 'rate', value: m => rate(m.units, m.orders),
        children: [c('Units Sold', 'int', m => m.units), c('Orders', 'int', m => m.orders)] },
      { label: 'Refund GMV', fmt: 'money', kind: 'flow', inverse: true, value: m => m.refund_gmv },
      { label: 'Refund Rate (% of GMV)', fmt: 'pct', kind: 'rate', inverse: true, value: m => rate(m.refund_gmv, m.gmv),
        children: [c('Refund GMV', 'money', m => m.refund_gmv), c('GMV', 'money', m => m.gmv)] },
      { label: 'Sales-Weighted In-Stock Rate', fmt: 'pct', kind: 'rate', value: m => rate(m.instock_num, m.instock_den),
        children: [c('In-Stock GMV', 'money', m => m.instock_num), c('Total GMV (rated SKUs)', 'money', m => m.instock_den)] },
    ],
  },
  {
    group: 'AVAILABILITY — can we actually fulfil the demand?',
    items: [
      { label: 'Late Dispatch Rate', fmt: 'pct', kind: 'rate', inverse: true, value: m => rate(m.late_orders, m.order_rows),
        children: [c('Late Orders', 'int', m => m.late_orders), c('Total Orders', 'int', m => m.order_rows)] },
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

export function mondaysEndingAt(reportWeek: string, count: number): string[] {
  const out: string[] = [];
  const d = new Date(reportWeek + 'T00:00:00Z');
  for (let i = count - 1; i >= 0; i--) out.push(new Date(d.getTime() - i * 7 * 864e5).toISOString().slice(0, 10));
  return out;
}
const monthOf = (mondayKey: string) => mondayKey.slice(0, 7);
const pctDelta = (a: number | null, b: number | null) => (a === null || b === null || b === 0 ? null : (a - b) / Math.abs(b));

export function buildTree(
  series: Map<string, Measures>, lifetimeByWeek: Record<string, number>,
  reportWeek: string, emvV: number, emvE: number,
): Tree {
  const trailing = mondaysEndingAt(reportWeek, 5);
  const span = mondaysEndingAt(reportWeek, 13);
  const repMonth = monthOf(reportWeek);
  const priorMonth = monthOf(mondaysEndingAt(reportWeek, 6)[0]);
  const mtdWeeks = span.filter(w => monthOf(w) === repMonth && w <= reportWeek);
  const priorWeeks = span.filter(w => monthOf(w) === priorMonth);

  const compute = (value: ValFn, kind: Kind, inverse?: boolean, fmt: Fmt = 'int'): Row => {
    const periodVal = (weeks: string[]): number | null => {
      if (!weeks.length) return null;
      const last = weeks[weeks.length - 1];
      if (kind === 'snapshot') { const m = series.get(last); return m ? value(m, emvV, emvE, lifetimeByWeek[last] ?? 0) : null; }
      return value(sumWeeks(series, weeks), emvV, emvE, lifetimeByWeek[last] ?? 0);
    };
    const weekVal = (wk: string): number | null => {
      const m = series.get(wk);
      if (!m && kind !== 'snapshot') return null;
      return value(m ?? ({} as Measures), emvV, emvE, lifetimeByWeek[wk] ?? 0);
    };
    const weekly = trailing.map(w => (series.has(w) || kind === 'snapshot' ? weekVal(w) : null));
    const cur = weekly[weekly.length - 1], prev = weekly[weekly.length - 2];
    const mtd = periodVal(mtdWeeks), prior = periodVal(priorWeeks);
    return {
      label: '', fmt, inverse, weekly,
      wowAbs: cur !== null && prev !== null ? cur - prev : null,
      wowPct: pctDelta(cur, prev), mtd, prior, momPct: pctDelta(mtd, prior),
    };
  };

  // GMV Driver Check — GMV = Impressions × CTR × CTOR × AOV, report week vs prior week
  const reportWk = series.get(reportWeek);
  const prevWk = series.get(trailing[trailing.length - 2]);
  const driverDefs: { driver: string; fmt: Fmt; f: (m: Measures) => number | null }[] = [
    { driver: 'Impressions', fmt: 'int', f: m => m.impressions },
    { driver: 'CTR', fmt: 'pct', f: m => rate(m.page_views, m.impressions) },
    { driver: 'CTOR', fmt: 'pct', f: m => rate(m.orders, m.page_views) },
    { driver: 'AOV', fmt: 'money', f: m => rate(m.gmv, m.orders) },
  ];
  const driverRows: Driver[] = driverDefs.map(d => {
    const t = reportWk ? d.f(reportWk) : null;
    const l = prevWk ? d.f(prevWk) : null;
    const logDelta = t !== null && l !== null && t > 0 && l > 0 ? 100 * Math.log(t / l) : null;
    return { driver: d.driver, fmt: d.fmt, thisWeek: t, lastWeek: l, wowAbs: t !== null && l !== null ? t - l : null, wowPct: pctDelta(t, l), logDelta };
  });
  let biggest = -1, biggestMag = -1;
  driverRows.forEach((r, i) => { if (r.logDelta !== null && Math.abs(r.logDelta) > biggestMag) { biggestMag = Math.abs(r.logDelta); biggest = i; } });

  const shortMonth = (mondayKey: string) => new Date(mondayKey + 'T00:00:00Z').toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const months = { mtd: shortMonth(reportWeek), prior: shortMonth(priorWeeks[0] ?? mondaysEndingAt(reportWeek, 6)[0]) };

  const groups: Group[] = DEFS.map(g => ({
    name: g.group,
    rows: g.items.map(def => {
      const row = compute(def.value, def.kind, def.inverse, def.fmt);
      row.label = def.label;
      if (def.children) row.children = def.children.map(ch => { const r = compute(ch.value, 'flow', false, ch.fmt); r.label = ch.label; return r; });
      return row;
    }),
  }));

  return { weeks: trailing, groups, reportWeek, months, drivers: { rows: driverRows, biggest } };
}
