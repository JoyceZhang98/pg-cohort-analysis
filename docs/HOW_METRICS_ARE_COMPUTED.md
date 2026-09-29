# How every metric is computed (TimescaleDB → number)

This is the exact logic behind the dashboard. Three layers:

1. **PULL** — SQL that reads raw numbers from a TimescaleDB table (per Monday-week, per brand).
2. **COMBINE** — how those raw numbers turn into a metric.
3. **ROLL UP** — how weekly numbers become the Trailing-5 / WoW / MTD / Prior columns.

`$shops` = the brand's `shop_id` (or all 4 P&G `shop_id`s for the "Total" rollup). Every base query buckets by
`date_trunc('week', <timestamp>)` (Monday start) and is filtered to the trailing 16 weeks.

---

## LAYER 1 — the raw PULL queries (verbatim from `lib/wbr.ts`)

Each query returns one row per week; the columns below become the "base measures".

### A. Product analytics — GMV, traffic, orders, units → `product_stat_rich_daily`
```sql
select date_trunc('week', psd.date) wk,
       sum(psd.gmv)               gmv,
       sum(psd.video_gmv)         video_gmv,
       sum(psd.live_gmv)          live_gmv,
       sum(psd.product_card_gmv)  card_gmv,
       sum(psd.impressions)       impressions,
       sum(psd.page_views)        page_views,
       sum(psd.items_sold)        units,
       sum(psd.orders)            orders
from product_stat_rich_daily psd
join product p on p.id = psd.product_id      -- product_id → shop_id
where p.shop_id = any($shops)
group by 1;
```

### B. Orders table — customers, subsidy, late dispatch → `order` + `line_item`
```sql
select date_trunc('week', o.create_time) wk,
       count(distinct o.user_id) customers,
       count(distinct o.id)      order_rows,
       count(distinct o.id) filter (
         where o.rts_time is not null and o.rts_sla_time is not null
           and o.rts_time > o.rts_sla_time)  late,
       coalesce(sum(
         nullif(li.platform_discount,'')::numeric
       + nullif(li.seller_discount ,'')::numeric), 0) subsidy
from "order" o
left join line_item li on li.order_id = o.id
where o.shop_id = any($shops)
group by 1;
```

### C. Affiliate GMV → `affiliate_order`
```sql
select date_trunc('week', ao.create_time) wk,
       sum(ao.price_amount * coalesce(ao.quantity,1)) aff_gmv
from affiliate_order ao
where ao.shop_id = any($shops)
group by 1;
```

### D. Ad spend & ad GMV (GMV Max) → `gmv_max_campaign_stat_daily`
```sql
select date_trunc('week', gs.date) wk,
       sum(gs.cost)          ad_spend,
       sum(gs.gross_revenue) ad_gmv
from gmv_max_campaign_stat_daily gs
join gmv_max_campaign gc on gc.id = gs.campaign_id   -- campaign_id → shop_id
where gc.shop_id = any($shops)
group by 1;
```

### E. New videos & active creators → `video`
```sql
select date_trunc('week', v.video_post_time) wk,
       count(*)                       new_videos,
       count(distinct v.affiliate_id) active_creators
from video v
where v.shop_id = any($shops) and v.affiliate_id is not null
group by 1;
```

### F. Views & engagement → `video_stat_rich_daily`
```sql
select date_trunc('week', vsd.date) wk,
       sum(vsd.views)    views,
       sum(vsd.likes)    likes,
       sum(vsd.comments) comments,
       sum(vsd.shares)   shares
from video_stat_rich_daily vsd
join video v on v.id = vsd.video_id     -- video_id → shop_id
where v.shop_id = any($shops)
group by 1;
```

### G. Refund GMV → `return`
```sql
select date_trunc('week', r.create_time) wk, sum(r.refund_subtotal) refund_gmv
from "return" r where r.shop_id = any($shops) group by 1;
```

### H. Sample funnel → `sample` + `sample_activity`
```sql
-- applied
select date_trunc('week', sm.created_at) wk, count(*) applied
from sample sm where sm.shop_id = any($shops) group by 1;

-- approved / sent  (event_timestamp is an integer epoch → to_timestamp())
select date_trunc('week', to_timestamp(sa.event_timestamp)) wk,
       count(distinct sa.sample_id) n
from sample_activity sa join sample sm on sm.id = sa.sample_id
where sm.shop_id = any($shops)
  and sa.new_status = 'AWAITING_SHIPMENT'   -- 'SHIPPED' for "sent"
group by 1;
```

### I. In-stock & SKU counts → `product_stat_daily`
```sql
select date_trunc('week', ps.date) wk,
       count(distinct ps.product_id) filter (where ps.has_inventory)     skus_live,
       count(distinct ps.product_id) filter (where not ps.has_inventory) skus_oos,
       sum(ps.total_revenue) filter (where ps.has_inventory)             instock_num,
       sum(ps.total_revenue)                                             instock_den
from product_stat_daily ps
join product p on p.id = ps.product_id
where p.shop_id = any($shops)
group by 1;
```

### J. Lifetime creators (cumulative) → `video`
```sql
select affiliate_id, min(video_post_time)::date first
from video where shop_id = any($shops) and affiliate_id is not null
group by 1;
```
→ Lifetime Creators at week *W* = count of creators whose `first ≤` end of week *W*.

---

## LAYER 2 — COMBINE: each metric from the base measures

Notation: the base measures above (gmv, orders, impressions, …) are per-period sums.
`$rateV`, `$rateE` = the EMV rates on the Brand Dashboard (default 10.0 and 0.30).

| Metric | Formula from base measures |
|---|---|
| **GMV** | `gmv` |
| **GMV with Subsidies** | `gmv + subsidy` |
| **Affiliate GMV** | `aff_gmv` |
| **Ads Take Rate** | `ad_gmv / gmv` |
| **Subsidy Rate** ⬇ | `subsidy / (gmv + subsidy)` |
| **GPM** | `gmv / views × 1000` |
| **Ads ROAS** | `ad_gmv / ad_spend` |
| **EMV** | `views/1000 × $rateV + (likes + comments + shares) × $rateE` |
| **Active Creators** | `active_creators` |
| **Lifetime Creators** | cumulative distinct creators (Layer 1-J) |
| **Total Customers** | `customers` |
| **Impressions** | `impressions` |
| **Video Views** | `views` |
| **Total Page Views** | `page_views` |
| **New Affiliate Videos** | `new_videos` |
| **Avg Views per Affiliate Video** | `views / new_videos` |
| **Orders** | `orders` |
| **CTR** | `page_views / impressions` |
| **CTOR** | `orders / page_views` |
| **Orders per 1,000 Views** | `orders / views × 1000` |
| **AOV** | `gmv / orders` |
| **Units Sold** | `units` |
| **Units per Order** | `units / orders` |
| **Refund GMV** ⬇ | `refund_gmv` |
| **Refund Rate** ⬇ | `refund_gmv / gmv` |
| **Sales-Weighted In-Stock Rate** | `instock_num / instock_den` |
| **Late Dispatch Rate** ⬇ | `late / order_rows` |
| **SKUs Live** | `skus_live` |
| **SKUs Out of Stock** ⬇ | `skus_oos` |
| **Samples Applied / Approved / Sent** | `applied` / `approved` / `sent` |

---

## LAYER 3 — ROLL UP: how weekly numbers fill the columns

- **A trailing-5-week cell** = that single week's value (a rate cell = that week's numerator ÷ that week's denominator).
- **WoW Δ / %** = report week vs. the prior week (Δ in percentage **points** for rate rows).
- **MTD** = the metric computed over *all weeks whose Monday falls in the report month, up to the report week*.
  **Prior** = the same over the *previous full month*.
- **Flow metrics** (GMV, Orders, Views, Units, Refund $, Samples, Customers, …) → the weekly base numbers are **summed** over the period's weeks.
- **Rate metrics** (CTR, CTOR, AOV, ROAS, GPM, In-Stock, …) → recomputed as **Σ(numerator) ÷ Σ(denominator)** over the period — never an average of weekly rates.
- **Snapshot metrics** (Lifetime Creators, SKUs Live/OOS) → the value at the **last week** of the period.

**Worked example — AOV, month-to-date (Sep):**
`MTD AOV = ( Σ gmv over Sep weeks ) ÷ ( Σ orders over Sep weeks )` — i.e. total September GMV divided by total
September orders, both summed from query A. Not the average of each week's AOV.

---

## GMV Driver Check (top of Brand Dashboard)

`GMV = Impressions × CTR × CTOR × AOV`, and this identity is **exact**:
```
Impressions × (page_views/impressions) × (orders/page_views) × (gmv/orders) = gmv
```
For each driver, using the report week vs. the prior week:
- **WoW Δ / %** = this week vs last week.
- **Log Δ (pts)** = `100 × ln(thisWeek ÷ lastWeek)`.
- **Biggest mover** = the driver with the largest `|Log Δ|`. Log growth is symmetric for a rise vs. a fall, and the
  four drivers' Log Δs **sum exactly** to GMV's own Log Δ — so it's the rigorous "what moved GMV most," which raw
  WoW % can get wrong.

---

## Internal Dashboard extras

### Sample Outreach Funnel (distinct creators, trailing 28 days vs previous 28 days)
```sql
-- Reached
count(distinct tcc.affiliate_id)
  from target_collaboration_creator tcc
  join target_collaboration tc on tc.id = tcc.target_collaboration_id
  where tc.shop_id = any($shops) and tcc.created_at in [window]
-- New sample requests   : count(distinct affiliate_id) from sample            (created_at in window)
-- Approved samples       : count(distinct sm.affiliate_id) via sample_activity 'AWAITING_SHIPMENT'
-- Awaiting content       : count(distinct affiliate_id) from sample where status='CONTENT_PENDING'  (snapshot)
-- Posted                 : count(distinct affiliate_id) from video             (video_post_time in window)
-- With sales             : count(distinct affiliate_id) from affiliate_order   (create_time in window)
```

### Advertising by Product (per product, trailing 28 days vs previous 28 days)
```sql
select p.title, p.main_image_url,
       sum(g.cost) cost, sum(g.gross_revenue) revenue, sum(g.orders) orders
from gmv_max_product_stat_daily g
join gmv_max_campaign gc on gc.id = g.campaign_id     -- → shop_id
left join product p on p.id = g.product_id            -- title + image
where gc.shop_id = any($shops) and g.date in [window]
group by p.title, p.main_image_url having sum(g.cost) > 0;
```
Then per product: `ROI = revenue/cost`, `Cost/Order = cost/orders`, `AOV = revenue/orders`.

### Creator Cohort Analysis (from `video` + `video_stat_rich_daily`)
```sql
-- cohort = the month a creator FIRST posted for the brand
first_post(affiliate) = min(date_trunc('month', video_post_time))
-- Size(cohort)         = count(distinct affiliate) whose first_post = that month
-- Retention M_n        = distinct cohort creators who posted a video in month n ÷ Size
-- GMV by Cohort M_n    = sum(video_stat_rich_daily.gmv) for that cohort's videos in month n
```

---

## Notes

- **GMV / Orders / Units / Impressions / Page Views** come from `product_stat_rich_daily` (TikTok's product
  analytics), a *smaller, attributed* order universe than the raw `order` table — chosen so GMV/AOV/CTR/CTOR are
  internally consistent. **Total Customers** and **Late Dispatch** come from the raw `order` table (only source
  for buyer identity + dispatch SLA).
- **Subsidy** = platform + seller discounts from `line_item`.
- **Ads** = GMV Max only (`gmv_max_*`). `advertiser_stat_daily` is unused (null revenue, patchy).
- **Dropped** (not in TimescaleDB): Month Goals / % Attainment, L3+ rows, Seller-Tier benchmarks, Halo Effect,
  # Hero Products, Shop Health (SPS), per-product ad Impressions/Clicks.
