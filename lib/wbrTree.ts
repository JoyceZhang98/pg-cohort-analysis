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
  external?: boolean;     // template metric with no TimescaleDB source (placeholder)
  sub?: boolean;          // render one indent level deeper (a sub-metric of the child above it)
  goal?: number | null;      // monthly goal (Supabase brand_gmv_goal)
  goalAttain?: number | null; // MTD ÷ goal
  children?: Row[]; // raw components behind a ratio / composite (drill-down)
};
export type Group = { name: string; super?: string; rows: Row[] };
export type Driver = { driver: string; fmt: Fmt; thisWeek: number | null; lastWeek: number | null; wowAbs: number | null; wowPct: number | null; logDelta: number | null };
export type Tree = {
  weeks: string[]; groups: Group[]; reportWeek: string;
  months: { mtd: string; prior: string };
  drivers: { total: Driver | null; rows: Driver[]; biggest: number; extra: Driver[] };
};

type Kind = 'flow' | 'rate' | 'snapshot';
type ValFn = (m: Measures, emvV: number, emvE: number, lifetime: number) => number | null;
type Child = { label: string; fmt: Fmt; value: ValFn; external?: boolean; sub?: boolean };
type Def = { label: string; fmt: Fmt; kind: Kind; inverse?: boolean; value: ValFn; children?: Child[]; external?: boolean };

const rate = (num: number, den: number) => (den ? num / den : null);
// component shorthands (all flows)
const c = (label: string, fmt: Fmt, value: ValFn, sub = false): Child => ({ label, fmt, value, sub: sub || undefined });
// external = template metric with no TimescaleDB source → placeholder (all cells blank)
const ext = (label: string, fmt: Fmt): Def => ({ label, fmt, kind: 'flow', value: () => null, external: true });
const xc = (label: string, fmt: Fmt): Child => ({ label, fmt, value: () => null, external: true });

const DEFS: { group: string; super?: string; items: Def[] }[] = [
  {
    group: 'GMV', super: 'HEADLINE',
    items: [
      { label: 'GMV with Subsidies', fmt: 'money', kind: 'flow', value: m => m.gmv + m.subsidy,
        children: [
          c('GMV', 'money', m => m.gmv),
          c('TikTok Subsidy', 'money', m => m.subsidy_tiktok),
          c('TTS Subsidy Rate', 'pct', m => rate(m.subsidy_tiktok, m.gmv + m.subsidy), true),
          c('Seller Subsidy', 'money', m => m.subsidy_seller),
        ] },
      { label: 'GMV', fmt: 'money', kind: 'flow', value: m => m.gmv,
        children: [c('Video GMV %', 'pct', m => rate(m.video_gmv, m.gmv)), c('Product-Card GMV %', 'pct', m => rate(m.card_gmv, m.gmv)), c('Live GMV %', 'pct', m => rate(m.live_gmv, m.gmv))] },
      { label: 'Affiliate GMV', fmt: 'money', kind: 'flow', value: m => m.affiliate_gmv,
        children: [
          c('Open Plan %', 'pct', m => rate(m.aff_gmv_open, m.affiliate_gmv)),
          c('Target Plan %', 'pct', m => rate(m.aff_gmv_target, m.affiliate_gmv)),
          c('TAP %', 'pct', m => rate(m.aff_gmv_tap, m.affiliate_gmv)),
        ] },
      { label: '# of Hero Products', fmt: 'int', kind: 'snapshot', value: m => m.hero_products },
      { label: 'Halo Effect', fmt: 'money', kind: 'flow', value: () => null, external: true,
        children: [xc('Sales Lift to DTC', 'money'), xc('Sales Lift to Amazon', 'money')] },
    ],
  },
  {
    group: 'MEDIA & CONTENT VALUE', super: 'HEADLINE',
    items: [
      { label: 'EMV (Earned Media Value)', fmt: 'money', kind: 'flow', value: (m, ev, ee) => (m.video_views / 1000) * ev + (m.likes + m.comments + m.shares) * ee,
        children: [
          c('Video Views', 'int', m => m.video_views),
          c('Engagements (Likes+Comments+Shares)', 'int', m => m.likes + m.comments + m.shares),
          c('Views $ component', 'money', (m, ev) => (m.video_views / 1000) * ev),
          c('Engagement $ component', 'money', (m, _ev, ee) => (m.likes + m.comments + m.shares) * ee),
        ] },
      { label: 'GPM (GMV per 1,000 views)', fmt: 'money', kind: 'rate', value: m => (m.video_views ? (m.gmv / m.video_views) * 1000 : null),
        children: [c('GMV', 'money', m => m.gmv), c('Video Views', 'int', m => m.video_views)] },
      { label: 'Ads ROAS (Ads GMV / Ad Spend)', fmt: 'x', kind: 'rate', value: m => rate(m.ad_gmv, m.ad_spend),
        children: [c('Ad GMV', 'money', m => m.ad_gmv), c('Ad Spend', 'money', m => m.ad_spend)] },
    ],
  },
  {
    group: 'CREATORS & CUSTOMERS', super: 'HEADLINE',
    items: [
      { label: 'Lifetime Creators', fmt: 'int', kind: 'snapshot', value: (_m, _v, _e, lifetime) => lifetime,
        children: [c('Lifetime L3+ Creators', 'int', (_m, _v, _e, lt) => lt)] },
      { label: 'Total Customers', fmt: 'int', kind: 'flow', value: m => m.customers,
        children: [c('New Customers', 'int', m => m.new_customers), c('Repeating Customers', 'int', m => m.returning_customers)] },
    ],
  },
  {
    group: 'AWARENESS — are we getting enough exposure?',
    items: [
      { label: 'Impressions', fmt: 'int', kind: 'flow', value: m => m.impressions,
        children: [c('Video Impressions', 'int', m => m.video_impr), c('Shop-Tab Impressions', 'int', m => m.card_impr), c('LIVE Impressions', 'int', m => m.live_impr)] },
      { label: 'Video Views', fmt: 'int', kind: 'flow', value: m => m.video_views,
        children: [
          c('Seller Video Views', 'int', m => m.seller_video_views),
          c('Affiliate Video Views', 'int', m => m.affiliate_video_views),
          c('L3+ Affiliate Video Views', 'int', m => m.l3_video_views || null),
        ] },
      { label: 'New Affiliate Videos', fmt: 'int', kind: 'flow', value: m => m.new_videos,
        children: [c('Active Creators (Creators Posting)', 'int', m => m.active_creators)] },
      { label: 'New L3+ Affiliate Videos', fmt: 'int', kind: 'flow', value: m => m.new_l3_videos,
        children: [c('Active L3+ Creators', 'int', m => m.active_l3_creators)] },
      { label: '% of Videos from L3+', fmt: 'pct', kind: 'rate', value: m => rate(m.new_l3_videos, m.l3_total_videos) },
      { label: 'L3+ Retention Rate', fmt: 'pct', kind: 'snapshot', value: () => null },
      { label: 'Avg Views per Affiliate Video', fmt: 'int', kind: 'rate', value: m => rate(m.affiliate_video_views, m.videos_with_views),
        children: [c('Affiliate Video Views', 'int', m => m.affiliate_video_views), c('Unique Affiliate Videos (with views)', 'int', m => m.videos_with_views)] },
      { label: 'Avg Views per L3+ Affiliate Video', fmt: 'int', kind: 'rate', value: m => rate(m.l3_video_views, m.l3_videos_with_views),
        children: [c('L3+ Video Views', 'int', m => m.l3_video_views || null), c('Unique L3+ Videos (with views)', 'int', m => m.l3_videos_with_views || null)] },
      { label: 'Ad Spend', fmt: 'money', kind: 'flow', value: m => m.ad_spend,
        children: [
          c('Creatives — Learning', 'int', m => m.cd_learning),
          c('Creatives — Delivering', 'int', m => m.cd_delivering),
        ] },
      { label: 'Total Clicks', fmt: 'int', kind: 'flow', value: m => m.page_views,
        children: [c('Video Clicks', 'int', m => m.video_pv), c('Shop-Tab Clicks', 'int', m => m.card_pv), c('LIVE Clicks', 'int', m => m.live_pv)] },
    ],
  },
  {
    group: 'CONVERSION — is the traffic converting?',
    items: [
      { label: 'Orders', fmt: 'int', kind: 'flow', value: m => m.orders },
      { label: 'CTR (Clicks / Impressions)', fmt: 'pct', kind: 'rate', value: m => rate(m.page_views, m.impressions),
        children: [
          c('Video CTR', 'pct', m => rate(m.video_pv, m.video_impr)),
          c('Shop-Tab CTR', 'pct', m => rate(m.card_pv, m.card_impr)),
          c('LIVE CTR', 'pct', m => rate(m.live_pv, m.live_impr)),
          c('Add-to-Cart Rate (LIVE)', 'pct', m => rate(m.cart_adds, m.cart_impr)),
        ] },
      { label: 'CTOR (Orders / Clicks)', fmt: 'pct', kind: 'rate', value: m => rate(m.orders, m.page_views),
        children: [
          c('Orders', 'int', m => m.orders),
          c('Total Clicks', 'int', m => m.page_views),
          c('Cart → Order Conversion (LIVE)', 'pct', m => rate(m.cart_orders, m.cart_adds)),
        ] },
    ],
  },
  {
    group: 'AVERAGE ORDER VALUE',
    items: [
      { label: 'AOV (GMV / Orders)', fmt: 'money', kind: 'rate', value: m => rate(m.gmv, m.orders),
        children: [c('GMV', 'money', m => m.gmv), c('Orders', 'int', m => m.orders)] },
      { label: 'Units per Order', fmt: 'ratio', kind: 'rate', value: m => rate(m.units, m.orders),
        children: [c('Units Sold', 'int', m => m.units), c('Orders', 'int', m => m.orders)] },
      { label: 'Refund Rate (% of GMV)', fmt: 'pct', kind: 'rate', inverse: true, value: m => rate(m.refund_gmv, m.gmv),
        children: [c('Refund GMV', 'money', m => m.refund_gmv), c('GMV', 'money', m => m.gmv)] },
    ],
  },
  {
    group: 'AVAILABILITY — can we actually fulfil the demand?',
    items: [
      { label: 'Unit-Weighted In-Stock Rate', fmt: 'pct', kind: 'rate', value: m => rate(m.instock_num, m.instock_den),
        children: [
          c('In-Stock Rate (SKU count, unweighted)', 'pct', m => rate(m.skus_live, m.skus_live + m.skus_oos)),
          c('SKUs Live', 'int', m => m.skus_live),
          c('SKUs Out of Stock', 'int', m => m.skus_oos),
        ] },
      { label: 'Shop Health Score (SPS)', fmt: 'ratio', kind: 'snapshot', value: m => m.sps || null },
      { label: 'Late Dispatch Rate', fmt: 'pct', kind: 'rate', inverse: true, value: m => rate(m.late_orders, m.order_rows),
        children: [c('Late Orders', 'int', m => m.late_orders), c('Total Orders', 'int', m => m.order_rows)] },
    ],
  },
  {
    group: 'INTERNAL OPERATIONS VIEW — sample funnel',
    items: [
      { label: 'Target Plan Sends (not de-duped)', fmt: 'int', kind: 'flow', value: m => m.target_plan_sends },
      ext('Email Outreach', 'int'),
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
  reportWeek: string, emvV: number, emvE: number, monthGoal = 0,
  goals: Record<string, number> = {}, l3LifetimeByWeek: Record<string, number> = {},
  l3RetentionByWeek: Record<string, number> = {},
  monthDistinctByMonth: Record<string, { aff: number; l3: number }> = {},
): Tree {
  // Only show a week column once all 7 of its days have fully elapsed (no partial weeks).
  const todayMs = Date.now();
  const weekComplete = (monday: string) => new Date(monday + 'T00:00:00Z').getTime() + 7 * 864e5 <= todayMs;
  const trailing = mondaysEndingAt(reportWeek, 5).filter(weekComplete);
  const span = mondaysEndingAt(reportWeek, 13);
  const repMonth = monthOf(reportWeek);
  const priorMonth = monthOf(mondaysEndingAt(reportWeek, 6)[0]);
  const mtdWeeks = span.filter(w => monthOf(w) === repMonth && w <= reportWeek);
  const priorWeeks = span.filter(w => monthOf(w) === priorMonth);

  // Monthly averages of views-per-video must use MONTH-distinct video counts (a video viewed across
  // several weeks counts once for the month), not the sum of weekly distinct counts. The views
  // numerator is additive across weeks, so it comes from summing; only the denominator is overridden.
  const md = (mo: string) => monthDistinctByMonth[mo] ?? { aff: 0, l3: 0 };
  const denAffMtd = md(repMonth).aff, denAffPrior = md(priorMonth).aff;
  const denL3Mtd = md(repMonth).l3, denL3Prior = md(priorMonth).l3;
  const affViews = (weeks: string[]) => (weeks.length ? sumWeeks(series, weeks).affiliate_video_views : 0);
  const l3Views = (weeks: string[]) => (weeks.length ? sumWeeks(series, weeks).l3_video_views : 0);
  const overrideMonthly = (row: Row, label: string) => {
    if (label === 'Avg Views per Affiliate Video') {
      row.mtd = denAffMtd ? affViews(mtdWeeks) / denAffMtd : null;
      row.prior = denAffPrior ? affViews(priorWeeks) / denAffPrior : null;
    } else if (label === 'Avg Views per L3+ Affiliate Video') {
      row.mtd = denL3Mtd ? l3Views(mtdWeeks) / denL3Mtd : null;
      row.prior = denL3Prior ? l3Views(priorWeeks) / denL3Prior : null;
    } else if (label === 'Unique Affiliate Videos (with views)') {
      row.mtd = denAffMtd || null; row.prior = denAffPrior || null;
    } else if (label === 'Unique L3+ Videos (with views)') {
      row.mtd = denL3Mtd || null; row.prior = denL3Prior || null;
    } else return;
    row.momPct = pctDelta(row.mtd, row.prior);
  };

  const compute = (value: ValFn, kind: Kind, inverse?: boolean, fmt: Fmt = 'int', lifeMap: Record<string, number> = lifetimeByWeek): Row => {
    const periodVal = (weeks: string[]): number | null => {
      if (!weeks.length) return null;
      const last = weeks[weeks.length - 1];
      if (kind === 'snapshot') { const m = series.get(last); return m ? value(m, emvV, emvE, lifeMap[last] ?? 0) : null; }
      return value(sumWeeks(series, weeks), emvV, emvE, lifeMap[last] ?? 0);
    };
    const weekVal = (wk: string): number | null => {
      const m = series.get(wk);
      if (!m && kind !== 'snapshot') return null;
      return value(m ?? ({} as Measures), emvV, emvE, lifeMap[wk] ?? 0);
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

  // GMV summary row shown atop the driver table ("driven by ↓")
  const gT = reportWk ? reportWk.gmv : null;
  const gL = prevWk ? prevWk.gmv : null;
  const gmvTotal: Driver = {
    driver: 'GMV', fmt: 'money', thisWeek: gT, lastWeek: gL,
    wowAbs: gT !== null && gL !== null ? gT - gL : null, wowPct: pctDelta(gT, gL),
    logDelta: gT !== null && gL !== null && gT > 0 && gL > 0 ? 100 * Math.log(gT / gL) : null,
  };

  // Supplementary context row (not part of the multiplicative identity): Unit-Weighted In-Stock Rate.
  const isT = reportWk ? rate(reportWk.instock_num, reportWk.instock_den) : null;
  const isL = prevWk ? rate(prevWk.instock_num, prevWk.instock_den) : null;
  const inStock: Driver = {
    driver: 'Unit-Weighted In-Stock Rate', fmt: 'pct', thisWeek: isT, lastWeek: isL,
    wowAbs: isT !== null && isL !== null ? isT - isL : null, wowPct: pctDelta(isT, isL),
    logDelta: isT !== null && isL !== null && isT > 0 && isL > 0 ? 100 * Math.log(isT / isL) : null,
  };

  const shortMonth = (mondayKey: string) => new Date(mondayKey + 'T00:00:00Z').toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const months = { mtd: shortMonth(reportWeek), prior: shortMonth(priorWeeks[0] ?? mondaysEndingAt(reportWeek, 6)[0]) };

  const groups: Group[] = DEFS.map(g => ({
    name: g.group,
    super: g.super,
    rows: g.items.map(def => {
      // L3+ Retention Rate is a month-over-month snapshot fed by its own map (not a weekly measure).
      const row = def.label === 'L3+ Retention Rate'
        ? compute((_m, _v, _e, r) => r, 'snapshot', false, def.fmt, l3RetentionByWeek)
        : compute(def.value, def.kind, def.inverse, def.fmt);
      row.label = def.label;
      row.external = def.external;
      overrideMonthly(row, def.label);
      // Benchmark goal (category × tier) takes precedence; GMV falls back to the Supabase monthGoal.
      const bench = goals[def.label];
      if (bench != null && bench > 0) { row.goal = bench; row.goalAttain = row.mtd !== null ? row.mtd / bench : null; }
      else if (def.label === 'GMV' && monthGoal > 0) { row.goal = monthGoal; row.goalAttain = row.mtd !== null ? row.mtd / monthGoal : null; }
      if (def.children) row.children = def.children.map(ch => {
        // Lifetime L3+ Creators is a cumulative snapshot fed by the L3+ lifetime map (not a weekly sum).
        const r = ch.label === 'Lifetime L3+ Creators'
          ? compute((_m, _v, _e, lt) => lt, 'snapshot', false, ch.fmt, l3LifetimeByWeek)
          : compute(ch.value, 'flow', false, ch.fmt);
        r.label = ch.label; r.external = ch.external; r.sub = ch.sub; overrideMonthly(r, ch.label); return r;
      });
      return row;
    }),
  }));

  return { weeks: trailing, groups, reportWeek, months, drivers: { total: gmvTotal, rows: driverRows, biggest, extra: [inStock] } };
}
