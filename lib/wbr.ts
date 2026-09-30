import { pool } from './db';
import { supaConfigured, supaRpc, supaL3Handles } from './supa';


// ---------- Weekly metrics engine for the WBR ----------
// Everything is bucketed into Monday-start weeks (Postgres date_trunc('week')).
// A week belongs to the month its Monday falls in (matches the template rule),
// so MTD / prior-month are just groupings of the weekly series.

export type Measures = {
  gmv: number;
  video_gmv: number;
  live_gmv: number;
  card_gmv: number;
  affiliate_gmv: number;
  aff_gmv_open: number; aff_gmv_target: number; aff_gmv_tap: number; // affiliate GMV by plan
  ad_spend: number;
  ad_gmv: number;
  subsidy: number;
  subsidy_tiktok: number;  // platform_discount (TikTok-funded)
  subsidy_seller: number;  // seller_discount (seller-funded)
  impressions: number;
  live_impr: number; video_impr: number; card_impr: number;   // impressions by channel
  page_views: number;
  live_pv: number; video_pv: number; card_pv: number;         // page views by channel
  video_views: number;
  videos_with_views: number; // distinct affiliate videos with views that week (denominator for Avg Views)
  seller_video_views: number;    // views on seller/brand-posted videos (affiliate_id null)
  affiliate_video_views: number; // views on affiliate/creator videos (affiliate_id not null)
  units: number;
  orders: number;
  customers: number;
  new_customers: number; returning_customers: number;
  late_orders: number;
  order_rows: number; // denominator for late-dispatch (order-table orders)
  hero_products: number; // products with >=$10k GMV & >=1000 orders over trailing 30d (snapshot)
  refund_gmv: number;
  new_videos: number;
  active_creators: number;
  likes: number;
  comments: number;
  shares: number;
  samples_applied: number;
  samples_approved: number;
  samples_delivered: number;
  target_plan_sends: number; // creators invited via targeted collaborations
  // GMV Max creative delivery status — distinct creatives by their latest status each week
  // (gmv_max_creative_stat_daily.creative_delivery_status; NOT_DELIVERYING is TikTok's spelling).
  cd_in_queue: number; cd_learning: number; cd_delivering: number; cd_not_delivering: number;
  cd_auth_needed: number; cd_not_active: number; cd_unavailable: number; cd_excluded: number; cd_rejected: number;
  skus_live: number;
  skus_oos: number;
  instock_num: number; // unit-weighted in-stock numerator (units sold on in-stock SKU-days)
  instock_den: number; // total units sold for the same SKUs
  // ---- Supabase-sourced (best-effort; 0 when unavailable) ----
  sps: number;              // Shop Performance Score (brand-avg for the week)
  new_l3_videos: number;    // new videos by L3+ creators
  active_l3_creators: number;
  l3_total_videos: number;  // all new videos (denominator for % from L3+)
  l3_video_views: number;       // views on L3+ creators' videos (TimescaleDB, attributed via handle match)
  l3_videos_with_views: number; // distinct L3+ videos with views that week
};

const ZERO: Measures = {
  gmv: 0, video_gmv: 0, live_gmv: 0, card_gmv: 0, affiliate_gmv: 0, ad_spend: 0, ad_gmv: 0,
  aff_gmv_open: 0, aff_gmv_target: 0, aff_gmv_tap: 0,
  subsidy: 0, subsidy_tiktok: 0, subsidy_seller: 0, impressions: 0, live_impr: 0, video_impr: 0, card_impr: 0, video_views: 0, videos_with_views: 0,
  page_views: 0, live_pv: 0, video_pv: 0, card_pv: 0, units: 0, orders: 0, customers: 0,
  new_customers: 0, returning_customers: 0,
  late_orders: 0, order_rows: 0, hero_products: 0, refund_gmv: 0, new_videos: 0, active_creators: 0, likes: 0,
  comments: 0, shares: 0, samples_applied: 0, samples_approved: 0, samples_delivered: 0, target_plan_sends: 0,
  cd_in_queue: 0, cd_learning: 0, cd_delivering: 0, cd_not_delivering: 0,
  cd_auth_needed: 0, cd_not_active: 0, cd_unavailable: 0, cd_excluded: 0, cd_rejected: 0,
  skus_live: 0, skus_oos: 0, instock_num: 0, instock_den: 0,
  sps: 0, new_l3_videos: 0, active_l3_creators: 0, l3_total_videos: 0,
  l3_video_views: 0, l3_videos_with_views: 0, seller_video_views: 0, affiliate_video_views: 0,
};

const WEEKS_BACK = 16;

// Returns weekly series keyed by 'YYYY-MM-DD' Monday, for the union of shopIds.
// supaNames = matching Supabase brand_name keys (for SPS + L3+ metrics; best-effort).
export async function fetchWeekly(shopIds: string[], supaNames: string[] = []): Promise<Map<string, Measures>> {
  const s = shopIds;
  const _l3h = await supaL3Handles(supaNames);
  const l3h = _l3h.length ? _l3h : [' ']; // non-empty so any($2) is valid (matches nothing)
  const series = new Map<string, Measures>();
  const bump = (wk: string, f: (m: Measures) => void) => {
    let m = series.get(wk);
    if (!m) { m = { ...ZERO }; series.set(wk, m); }
    f(m);
  };
  const since = `current_date - interval '${WEEKS_BACK} weeks'`;

  // product_stat_daily is a compressed hypertable segmented by product_id, so filtering by an
  // explicit product-id list uses segment/index exclusion (fast). Joining on product.shop_id
  // instead forces a full decompress-scan of every shop (minutes). Fetch the ids up front.
  let prodIds: string[] = [];
  try {
    prodIds = (await pool.query<{ id: string }>(
      `select id from product where shop_id = any($1)`, [s])).rows.map(r => r.id);
  } catch (e) {
    console.error('prodIds fetch failed (in-stock will be blank):', (e as Error).message);
  }

  // Resilient: a single slow/timed-out query degrades to blank for its measures instead of
  // failing the whole report (which would render "no numbers"). Uses allSettled, not all.
  const settled = await Promise.allSettled([
    pool.query(
      `select to_char(date_trunc('week', psd.date),'YYYY-MM-DD') wk,
         sum(psd.gmv) gmv, sum(psd.video_gmv) video_gmv, sum(psd.live_gmv) live_gmv,
         sum(psd.product_card_gmv) card_gmv,
         sum(psd.impressions) impressions, sum(psd.live_impressions) live_impr,
         sum(psd.video_impressions) video_impr, sum(psd.product_card_impressions) card_impr,
         sum(psd.page_views) page_views, sum(psd.live_page_views) live_pv,
         sum(psd.video_page_views) video_pv, sum(psd.product_card_page_views) card_pv,
         sum(psd.items_sold) units, sum(psd.orders) orders
       from product_stat_rich_daily psd join product p on p.id = psd.product_id
       where p.shop_id = any($1) and psd.date >= ${since}
       group by 1`, [s]),
    pool.query(
      // Counts from "order" alone — joining line_item here forced a count(distinct) over the
      // exploded join (~15s); split out, this is ~1s. Subsidy is summed separately (subs query).
      `select to_char(date_trunc('week', o.create_time),'YYYY-MM-DD') wk,
         count(distinct o.user_id) customers, count(distinct o.id) order_rows,
         count(distinct o.id) filter (where o.rts_time is not null and o.rts_sla_time is not null and o.rts_time > o.rts_sla_time) late
       from "order" o
       where o.shop_id = any($1) and o.create_time >= ${since}
       group by 1`, [s]),
    pool.query(
      `select to_char(date_trunc('week', o.create_time),'YYYY-MM-DD') wk,
         coalesce(sum((nullif(li.platform_discount,''))::numeric),0) subsidy_tiktok,
         coalesce(sum((nullif(li.seller_discount,''))::numeric),0) subsidy_seller
       from "order" o join line_item li on li.order_id = o.id
       where o.shop_id = any($1) and o.create_time >= ${since}
       group by 1`, [s]),
    pool.query(
      `with firsts as (select user_id, min(create_time) f from "order" where shop_id = any($1) group by 1)
       select to_char(date_trunc('week', o.create_time),'YYYY-MM-DD') wk,
         count(distinct o.user_id) filter (where f.f >= date_trunc('week', o.create_time)) new_cust,
         count(distinct o.user_id) filter (where f.f <  date_trunc('week', o.create_time)) returning_cust
       from "order" o join firsts f on f.user_id = o.user_id
       where o.shop_id = any($1) and o.create_time >= ${since}
       group by 1`, [s]),
    pool.query(
      `select to_char(date_trunc('week', ao.create_time),'YYYY-MM-DD') wk,
         sum(ao.price_amount * coalesce(ao.quantity,1)) aff_gmv,
         sum(ao.price_amount * coalesce(ao.quantity,1)) filter (where nullif(ao.platform_open_collaboration_id,'') is not null) aff_open,
         sum(ao.price_amount * coalesce(ao.quantity,1)) filter (where nullif(ao.platform_target_collaboration_id,'') is not null) aff_target,
         sum(ao.price_amount * coalesce(ao.quantity,1)) filter (where nullif(ao.platform_campaign_id,'') is not null) aff_tap
       from affiliate_order ao where ao.shop_id = any($1) and ao.create_time >= ${since}
       group by 1`, [s]),
    pool.query(
      `select to_char(date_trunc('week', gs.date),'YYYY-MM-DD') wk,
         sum(gs.cost) ad_spend, sum(gs.gross_revenue) ad_gmv
       from gmv_max_campaign_stat_daily gs join gmv_max_campaign gc on gc.id = gs.campaign_id
       where gc.shop_id = any($1) and gs.date >= ${since}
       group by 1`, [s]),
    pool.query(
      `select to_char(date_trunc('week', v.video_post_time),'YYYY-MM-DD') wk,
         count(*) new_videos
       from video v where v.shop_id = any($1) and v.video_post_time >= ${since}
       group by 1`, [s]),
    pool.query(
      `select to_char(date_trunc('week', vsd.date),'YYYY-MM-DD') wk,
         sum(vsd.views) views, sum(vsd.likes) likes, sum(vsd.comments) comments, sum(vsd.shares) shares,
         count(distinct vsd.video_id) filter (where v.affiliate_id is not null) videos_with_views,
         sum(vsd.views) filter (where lower(af.username) = any($2)) l3_views,
         count(distinct vsd.video_id) filter (where lower(af.username) = any($2)) l3_vids,
         sum(vsd.views) filter (where v.affiliate_id is null) seller_views,
         sum(vsd.views) filter (where v.affiliate_id is not null) affiliate_views
       from video_stat_rich_daily vsd join video v on v.id = vsd.video_id
         left join affiliate af on af.id = v.affiliate_id
       where v.shop_id = any($1) and vsd.date >= ${since}
       group by 1`, [s, l3h]),
    pool.query(
      `select to_char(date_trunc('week', r.create_time),'YYYY-MM-DD') wk, sum(r.refund_subtotal) refund_gmv
       from "return" r where r.shop_id = any($1) and r.create_time >= ${since}
       group by 1`, [s]),
    pool.query(
      `select to_char(date_trunc('week', sm.created_at),'YYYY-MM-DD') wk, count(*) applied
       from sample sm where sm.shop_id = any($1) and sm.created_at >= ${since}
       group by 1`, [s]),
    pool.query(
      `select to_char(date_trunc('week', to_timestamp(sa.event_timestamp)),'YYYY-MM-DD') wk, count(distinct sa.sample_id) approved
       from sample_activity sa join sample sm on sm.id = sa.sample_id
       where sm.shop_id = any($1) and sa.new_status = 'AWAITING_SHIPMENT' and to_timestamp(sa.event_timestamp) >= ${since}
       group by 1`, [s]),
    pool.query(
      `select to_char(date_trunc('week', to_timestamp(sa.event_timestamp)),'YYYY-MM-DD') wk, count(distinct sa.sample_id) sent
       from sample_activity sa join sample sm on sm.id = sa.sample_id
       where sm.shop_id = any($1) and sa.new_status = 'SHIPPED' and to_timestamp(sa.event_timestamp) >= ${since}
       group by 1`, [s]),
    pool.query(
      `select to_char(date_trunc('week', ps.date),'YYYY-MM-DD') wk,
         count(distinct ps.product_id) filter (where ps.has_inventory) skus_live,
         count(distinct ps.product_id) filter (where not ps.has_inventory) skus_oos,
         sum(ps.units_sold_total) filter (where ps.has_inventory) instock_num,
         sum(ps.units_sold_total) instock_den
       from product_stat_daily ps
       where ps.product_id = any($1) and ps.date >= ${since}
       group by 1`, [prodIds]),
    pool.query(
      `select to_char(date_trunc('week', v.video_post_time),'YYYY-MM-DD') wk,
         count(distinct v.affiliate_id) active
       from video v where v.shop_id = any($1) and v.affiliate_id is not null and v.video_post_time >= ${since}
       group by 1`, [s]),
    pool.query(
      // Resolve the shop's collaboration ids first (small set), then count creator rows by that id
      // list — lets Postgres use the target_collaboration_id index instead of joining every
      // creator row to target_collaboration (faster, less likely to time out under an ETL lock).
      `with ids as (select id from target_collaboration where shop_id = any($1))
       select to_char(date_trunc('week', tcc.created_at),'YYYY-MM-DD') wk, count(*) sends
       from target_collaboration_creator tcc
       where tcc.target_collaboration_id in (select id from ids) and tcc.created_at >= ${since}
       group by 1`, [s]),
    pool.query(
      `with wk as (
         select generate_series(date_trunc('week', current_date) - interval '${WEEKS_BACK} weeks',
                                 date_trunc('week', current_date) - interval '1 week', interval '1 week')::date monday
       ),
       prod as (
         select psd.product_id, psd.date, psd.gmv, psd.orders
         from product_stat_rich_daily psd join product p on p.id = psd.product_id
         where p.shop_id = any($1) and psd.date >= (select min(monday) from wk) - interval '30 days'
       )
       select to_char(w.monday,'YYYY-MM-DD') wk, count(*) hero
       from wk w
       left join lateral (
         select pr.product_id from prod pr
         where pr.date > (w.monday + interval '6 days') - interval '30 days'
           and pr.date <= w.monday + interval '6 days'
         group by pr.product_id
         having sum(pr.gmv) >= 30000 or sum(pr.orders) >= 1000
       ) h on true
       group by 1`, [s]),
    pool.query(
      `with base as (
         select date_trunc('week', cs.date) wk, cs.creative_platform_id cid, cs.creative_delivery_status st,
                row_number() over (partition by date_trunc('week', cs.date), cs.creative_platform_id order by cs.date desc) rn
         from gmv_max_creative_stat_daily cs join gmv_max_campaign gc on gc.id = cs.campaign_id
         where gc.shop_id = any($1) and cs.date >= ${since})
       select to_char(wk,'YYYY-MM-DD') wk, st, count(*) n from base where rn = 1 group by 1, 2`, [s]),
  ]);
  settled.forEach((r, i) => { if (r.status === 'rejected') console.error(`wbr query #${i} failed:`, (r.reason as Error)?.message); });
  const [prsd, ord, subs, custNR, aff, adv, vid, vsd, ret, smp, smpAppr, smpSent, stock, active, tps, hero, cds] =
    settled.map(r => (r.status === 'fulfilled' ? r.value : { rows: [] }));

  const n = (x: unknown) => Number(x) || 0;
  for (const r of prsd.rows) bump(r.wk, m => { m.gmv += n(r.gmv); m.video_gmv += n(r.video_gmv); m.live_gmv += n(r.live_gmv); m.card_gmv += n(r.card_gmv); m.impressions += n(r.impressions); m.live_impr += n(r.live_impr); m.video_impr += n(r.video_impr); m.card_impr += n(r.card_impr); m.page_views += n(r.page_views); m.live_pv += n(r.live_pv); m.video_pv += n(r.video_pv); m.card_pv += n(r.card_pv); m.units += n(r.units); m.orders += n(r.orders); });
  for (const r of ord.rows) bump(r.wk, m => { m.customers += n(r.customers); m.order_rows += n(r.order_rows); m.late_orders += n(r.late); });
  for (const r of subs.rows) bump(r.wk, m => { m.subsidy_tiktok += n(r.subsidy_tiktok); m.subsidy_seller += n(r.subsidy_seller); m.subsidy += n(r.subsidy_tiktok) + n(r.subsidy_seller); });
  for (const r of custNR.rows) bump(r.wk, m => { m.new_customers += n(r.new_cust); m.returning_customers += n(r.returning_cust); });
  for (const r of aff.rows) bump(r.wk, m => { m.affiliate_gmv += n(r.aff_gmv); m.aff_gmv_open += n(r.aff_open); m.aff_gmv_target += n(r.aff_target); m.aff_gmv_tap += n(r.aff_tap); });
  for (const r of adv.rows) bump(r.wk, m => { m.ad_spend += n(r.ad_spend); m.ad_gmv += n(r.ad_gmv); });
  for (const r of vid.rows) bump(r.wk, m => { m.new_videos += n(r.new_videos); });
  for (const r of vsd.rows) bump(r.wk, m => { m.video_views += n(r.views); m.likes += n(r.likes); m.comments += n(r.comments); m.shares += n(r.shares); m.videos_with_views += n(r.videos_with_views); m.l3_video_views += n(r.l3_views); m.l3_videos_with_views += n(r.l3_vids); m.seller_video_views += n(r.seller_views); m.affiliate_video_views += n(r.affiliate_views); });
  for (const r of ret.rows) bump(r.wk, m => { m.refund_gmv += n(r.refund_gmv); });
  for (const r of smp.rows) bump(r.wk, m => { m.samples_applied += n(r.applied); });
  for (const r of smpAppr.rows) bump(r.wk, m => { m.samples_approved += n(r.approved); });
  for (const r of smpSent.rows) bump(r.wk, m => { m.samples_delivered += n(r.sent); });
  for (const r of stock.rows) bump(r.wk, m => { m.skus_live += n(r.skus_live); m.skus_oos += n(r.skus_oos); m.instock_num += n(r.instock_num); m.instock_den += n(r.instock_den); });
  for (const r of active.rows) bump(r.wk, m => { m.active_creators += n(r.active); });
  for (const r of tps.rows) bump(r.wk, m => { m.target_plan_sends += n(r.sends); });
  for (const r of hero.rows) bump(r.wk, m => { m.hero_products += n(r.hero); });
  const CDMAP: Record<string, keyof Measures> = {
    IN_QUEUE: 'cd_in_queue', LEARNING: 'cd_learning', DELIVERING: 'cd_delivering', NOT_DELIVERYING: 'cd_not_delivering',
    AUTHORIZATION_NEEDED: 'cd_auth_needed', NOT_ACTIVE: 'cd_not_active', UNAVAILABLE: 'cd_unavailable', EXCLUDED: 'cd_excluded', REJECTED: 'cd_rejected',
  };
  for (const r of cds.rows) { const key = CDMAP[r.st as string]; if (key) bump(r.wk, m => { (m[key] as number) += n(r.n); }); }

  // ---- Supabase over HTTPS REST (best-effort) — SPS + L3+ ----
  if (supaConfigured() && supaNames.length) {
    try {
      const [sps, l3] = await Promise.all([
        supaRpc<{ wk: string; sps: string }[]>('wbr_sps_weekly', { p_names: supaNames }),
        supaRpc<{ wk: string; new_l3: string; active_l3: string; total: string }[]>('wbr_l3_weekly', { p_names: supaNames }),
      ]);
      for (const r of sps) bump(r.wk, m => { m.sps = n(r.sps); });
      for (const r of l3) bump(r.wk, m => { m.new_l3_videos += n(r.new_l3); m.active_l3_creators += n(r.active_l3); m.l3_total_videos += n(r.total); });
    } catch (e) {
      console.error('Supabase fetch failed (SPS/L3+ will be blank):', (e as Error).message);
    }
  }

  return series;
}

// Report-month GMV goal from Supabase brand_gmv_goal (best-effort; 0 if none/unavailable).
export async function fetchMonthGoal(supaNames: string[], reportMonth: string): Promise<number> {
  if (!supaConfigured() || !supaNames.length) return 0;
  try {
    const goal = await supaRpc<number>('wbr_month_goal', { p_names: supaNames, p_month: reportMonth });
    return Number(goal) || 0;
  } catch {
    return 0;
  }
}

// Lifetime creators (cumulative distinct posting affiliates) at each week-end.
// Returns { all, l3 } — l3 counts only affiliates whose username is in the L3+ handle set.
export async function fetchLifetimeCreators(
  shopIds: string[], weekMondays: string[], l3Handles: string[] = [],
): Promise<{ all: Record<string, number>; l3: Record<string, number> }> {
  const { rows } = await pool.query<{ first: string; username: string | null }>(
    `select min(v.video_post_time)::date first, lower(af.username) username
     from video v left join affiliate af on af.id = v.affiliate_id
     where v.shop_id = any($1) and v.affiliate_id is not null and v.video_post_time is not null
     group by v.affiliate_id, lower(af.username)`, [shopIds]);
  const l3set = new Set(l3Handles);
  const firsts = rows.map(r => ({ t: new Date(r.first).getTime(), l3: !!r.username && l3set.has(r.username) }));
  const all: Record<string, number> = {}, l3: Record<string, number> = {};
  for (const wk of weekMondays) {
    const end = new Date(wk).getTime() + 7 * 864e5; // through end of that week
    all[wk] = firsts.filter(f => f.t <= end).length;
    l3[wk] = firsts.filter(f => f.t <= end && f.l3).length;
  }
  return { all, l3 };
}

// Month-over-month L3+ creator retention, per week: of L3+ creators who posted in the calendar
// month BEFORE that week's month, the share who also posted in that week's month. Best-effort {} .
export async function fetchL3Retention(shopIds: string[], weekMondays: string[], l3Handles: string[]): Promise<Record<string, number>> {
  if (!l3Handles.length) return {};
  try {
    const { rows } = await pool.query<{ u: string; mo: string }>(
      `select distinct lower(af.username) u, to_char(date_trunc('month', v.video_post_time),'YYYY-MM') mo
       from video v join affiliate af on af.id = v.affiliate_id
       where v.shop_id = any($1) and v.video_post_time >= current_date - interval '7 months'
         and lower(af.username) = any($2)`, [shopIds, l3Handles]);
    const byMonth = new Map<string, Set<string>>();
    for (const r of rows) { if (!byMonth.has(r.mo)) byMonth.set(r.mo, new Set()); byMonth.get(r.mo)!.add(r.u); }
    const out: Record<string, number> = {};
    for (const wk of weekMondays) {
      const [y, m] = wk.slice(0, 7).split('-').map(Number);
      const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
      const base = byMonth.get(prev), cur = byMonth.get(wk.slice(0, 7));
      if (!base || base.size === 0) continue; // no L3+ base last month → leave blank
      let retained = 0; if (cur) for (const h of base) if (cur.has(h)) retained++;
      out[wk] = retained / base.size;
    }
    return out;
  } catch { return {}; }
}

// Distinct affiliate videos with views per CALENDAR MONTH (and the L3+ subset). This is the correct
// monthly denominator for "Avg Views per Affiliate Video": a video that receives views across several
// weeks of a month must count ONCE for the month — summing the weekly distinct counts double-counts it
// and badly inflates the denominator (deflating the monthly average). Best-effort {}.
export async function fetchMonthlyVideoDistinct(
  shopIds: string[], l3Handles: string[],
): Promise<Record<string, { aff: number; l3: number }>> {
  try {
    const { rows } = await pool.query<{ mo: string; aff: string; l3: string }>(
      `select to_char(date_trunc('month', vsd.date),'YYYY-MM') mo,
         count(distinct vsd.video_id) filter (where v.affiliate_id is not null) aff,
         count(distinct vsd.video_id) filter (where lower(af.username) = any($2)) l3
       from video_stat_rich_daily vsd join video v on v.id = vsd.video_id
         left join affiliate af on af.id = v.affiliate_id
       where v.shop_id = any($1) and vsd.date >= current_date - interval '${WEEKS_BACK} weeks'
       group by 1`, [shopIds, l3Handles.length ? l3Handles : ['']]);
    const out: Record<string, { aff: number; l3: number }> = {};
    for (const r of rows) out[r.mo] = { aff: Number(r.aff), l3: Number(r.l3) };
    return out;
  } catch { return {}; }
}

// Sum a subset of weekly measures over the given week keys.
export function sumWeeks(series: Map<string, Measures>, weeks: string[]): Measures {
  const acc: Measures = { ...ZERO };
  for (const wk of weeks) {
    const m = series.get(wk);
    if (!m) continue;
    (Object.keys(acc) as (keyof Measures)[]).forEach(k => { acc[k] += m[k]; });
  }
  return acc;
}
