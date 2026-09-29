import { pool } from './db';

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
  ad_spend: number;
  ad_gmv: number;
  subsidy: number;
  impressions: number;
  live_impr: number; video_impr: number; card_impr: number;   // impressions by channel
  page_views: number;
  live_pv: number; video_pv: number; card_pv: number;         // page views by channel
  video_views: number;
  units: number;
  orders: number;
  customers: number;
  new_customers: number; returning_customers: number;
  late_orders: number;
  order_rows: number; // denominator for late-dispatch (order-table orders)
  refund_gmv: number;
  new_videos: number;
  active_creators: number;
  likes: number;
  comments: number;
  shares: number;
  samples_applied: number;
  samples_approved: number;
  samples_delivered: number;
  skus_live: number;
  skus_oos: number;
  instock_num: number; // sales-weighted in-stock numerator (in-stock GMV)
  instock_den: number; // total GMV for the same SKUs
};

const ZERO: Measures = {
  gmv: 0, video_gmv: 0, live_gmv: 0, card_gmv: 0, affiliate_gmv: 0, ad_spend: 0, ad_gmv: 0,
  subsidy: 0, impressions: 0, live_impr: 0, video_impr: 0, card_impr: 0, video_views: 0,
  page_views: 0, live_pv: 0, video_pv: 0, card_pv: 0, units: 0, orders: 0, customers: 0,
  new_customers: 0, returning_customers: 0,
  late_orders: 0, order_rows: 0, refund_gmv: 0, new_videos: 0, active_creators: 0, likes: 0,
  comments: 0, shares: 0, samples_applied: 0, samples_approved: 0, samples_delivered: 0,
  skus_live: 0, skus_oos: 0, instock_num: 0, instock_den: 0,
};

const WEEKS_BACK = 16;

// Returns weekly series keyed by 'YYYY-MM-DD' Monday, for the union of shopIds.
export async function fetchWeekly(shopIds: string[]): Promise<Map<string, Measures>> {
  const s = shopIds;
  const series = new Map<string, Measures>();
  const bump = (wk: string, f: (m: Measures) => void) => {
    let m = series.get(wk);
    if (!m) { m = { ...ZERO }; series.set(wk, m); }
    f(m);
  };
  const since = `current_date - interval '${WEEKS_BACK} weeks'`;

  const [prsd, ord, custNR, aff, adv, vid, vsd, ret, smp, smpAppr, smpSent, stock, active] = await Promise.all([
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
      `select to_char(date_trunc('week', o.create_time),'YYYY-MM-DD') wk,
         count(distinct o.user_id) customers, count(distinct o.id) order_rows,
         count(distinct o.id) filter (where o.rts_time is not null and o.rts_sla_time is not null and o.rts_time > o.rts_sla_time) late,
         coalesce(sum((nullif(li.platform_discount,''))::numeric + (nullif(li.seller_discount,''))::numeric),0) subsidy
       from "order" o left join line_item li on li.order_id = o.id
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
         sum(ao.price_amount * coalesce(ao.quantity,1)) aff_gmv
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
         sum(vsd.views) views, sum(vsd.likes) likes, sum(vsd.comments) comments, sum(vsd.shares) shares
       from video_stat_rich_daily vsd join video v on v.id = vsd.video_id
       where v.shop_id = any($1) and vsd.date >= ${since}
       group by 1`, [s]),
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
         sum(ps.total_revenue) filter (where ps.has_inventory) instock_num,
         sum(ps.total_revenue) instock_den
       from product_stat_daily ps join product p on p.id = ps.product_id
       where p.shop_id = any($1) and ps.date >= ${since}
       group by 1`, [s]),
    pool.query(
      `select to_char(date_trunc('week', v.video_post_time),'YYYY-MM-DD') wk,
         count(distinct v.affiliate_id) active
       from video v where v.shop_id = any($1) and v.affiliate_id is not null and v.video_post_time >= ${since}
       group by 1`, [s]),
  ]);

  const n = (x: unknown) => Number(x) || 0;
  for (const r of prsd.rows) bump(r.wk, m => { m.gmv += n(r.gmv); m.video_gmv += n(r.video_gmv); m.live_gmv += n(r.live_gmv); m.card_gmv += n(r.card_gmv); m.impressions += n(r.impressions); m.live_impr += n(r.live_impr); m.video_impr += n(r.video_impr); m.card_impr += n(r.card_impr); m.page_views += n(r.page_views); m.live_pv += n(r.live_pv); m.video_pv += n(r.video_pv); m.card_pv += n(r.card_pv); m.units += n(r.units); m.orders += n(r.orders); });
  for (const r of ord.rows) bump(r.wk, m => { m.customers += n(r.customers); m.order_rows += n(r.order_rows); m.late_orders += n(r.late); m.subsidy += n(r.subsidy); });
  for (const r of custNR.rows) bump(r.wk, m => { m.new_customers += n(r.new_cust); m.returning_customers += n(r.returning_cust); });
  for (const r of aff.rows) bump(r.wk, m => { m.affiliate_gmv += n(r.aff_gmv); });
  for (const r of adv.rows) bump(r.wk, m => { m.ad_spend += n(r.ad_spend); m.ad_gmv += n(r.ad_gmv); });
  for (const r of vid.rows) bump(r.wk, m => { m.new_videos += n(r.new_videos); });
  for (const r of vsd.rows) bump(r.wk, m => { m.video_views += n(r.views); m.likes += n(r.likes); m.comments += n(r.comments); m.shares += n(r.shares); });
  for (const r of ret.rows) bump(r.wk, m => { m.refund_gmv += n(r.refund_gmv); });
  for (const r of smp.rows) bump(r.wk, m => { m.samples_applied += n(r.applied); });
  for (const r of smpAppr.rows) bump(r.wk, m => { m.samples_approved += n(r.approved); });
  for (const r of smpSent.rows) bump(r.wk, m => { m.samples_delivered += n(r.sent); });
  for (const r of stock.rows) bump(r.wk, m => { m.skus_live += n(r.skus_live); m.skus_oos += n(r.skus_oos); m.instock_num += n(r.instock_num); m.instock_den += n(r.instock_den); });
  for (const r of active.rows) bump(r.wk, m => { m.active_creators += n(r.active); });

  return series;
}

// Lifetime creators (cumulative distinct posting affiliates) at each week-end.
export async function fetchLifetimeCreators(shopIds: string[], weekMondays: string[]): Promise<Record<string, number>> {
  const { rows } = await pool.query<{ affiliate_id: string; first: string }>(
    `select affiliate_id, min(video_post_time)::date first
     from video where shop_id = any($1) and affiliate_id is not null and video_post_time is not null
     group by 1`, [shopIds]);
  const firsts = rows.map(r => new Date(r.first).getTime());
  const out: Record<string, number> = {};
  for (const wk of weekMondays) {
    const end = new Date(wk).getTime() + 7 * 864e5; // through end of that week
    out[wk] = firsts.filter(t => t <= end).length;
  }
  return out;
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
