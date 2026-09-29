# P&G WBR — Metrics Dictionary

Every number in the dashboard is pulled **live from TimescaleDB** (no manual input) and filtered to the
brand's `shop_id` (or the union of all 4 P&G `shop_id`s for the "Total / all P&G" rollup). This document
lists, for each metric, **which table/column it comes from** and **exactly how it's computed**.

Brands → `shop_id`:
New Chapter `019a763b…608047` · Farmacy `019a75c5…c7c8ac` · Olay `019a75c7…9989b4` · Secret `019ff469…4395c9`

---

## 1. Conventions (how to read)

- **Week bucket** — everything is grouped into **Monday-start weeks** via `date_trunc('week', <ts>)`.
- **Trailing 5 weeks** — the 5 most recent *complete* weeks. The current partial week (this week's Monday) is excluded.
- **WoW** — report week vs. the immediately prior week. `Δ` = absolute change (percentage **points** for rate metrics); `%` = relative change.
- **MTD / MoM** — a week belongs to the month **its Monday falls in**. `MTD` = sum of the report month's weeks up to and including the report week. `MoM %` = MTD vs. the **prior full month** (same week-bucketing).
- **Aggregation kind:**
  - *Flow* (GMV, Orders, Views, Units, Refund $, Samples…): summed across the weeks in a period.
  - *Rate* (CTR, CTOR, AOV, ROAS, GPM, In-Stock…): recomputed as **Σ(numerator) ÷ Σ(denominator)** for each period — **never averaged**.
  - *Snapshot* (Lifetime Creators, SKUs Live/OOS, "Creators awaiting content"): the value at the **last week / current state** of the period, not summed.
- **Inverse metrics (⬇, lower is better):** Subsidy Rate, Refund GMV, Refund Rate, Late Dispatch Rate, SKUs Out of Stock, Ad Cost, Cost/Order. Their color is flipped so **red always means "worse."**
- **Join keys:** `product_stat_*`/`product_stat_daily` → `product` (`product_id`) → `shop_id`; `video_stat_rich_daily` → `video` (`video_id`) → `shop_id`; `gmv_max_*_stat_daily` → `gmv_max_campaign` (`campaign_id`) → `shop_id`; `line_item` → `order` (`order_id`) → `shop_id`; `sample_activity` → `sample` (`sample_id`) → `shop_id`.

---

## 2. Base measures pulled per week (the raw building blocks)

| Measure | Table (join) | Exact expression |
|---|---|---|
| gmv, video_gmv, live_gmv, card_gmv | `product_stat_rich_daily` ⋈ `product` (shop) | `sum(gmv)`, `sum(video_gmv)`, `sum(live_gmv)`, `sum(product_card_gmv)` |
| impressions, page_views, units, orders | `product_stat_rich_daily` ⋈ `product` | `sum(impressions)`, `sum(page_views)`, `sum(items_sold)`, `sum(orders)` |
| customers | `order` | `count(distinct user_id)` |
| order_rows | `order` | `count(distinct id)` (denominator for Late Dispatch) |
| late_orders | `order` | `count(distinct id) where rts_time > rts_sla_time` |
| subsidy | `line_item` ⋈ `order` (shop) | `sum(nullif(platform_discount,'')::numeric + nullif(seller_discount,'')::numeric)` |
| affiliate_gmv | `affiliate_order` | `sum(price_amount * coalesce(quantity,1))` |
| ad_spend, ad_gmv | `gmv_max_campaign_stat_daily` ⋈ `gmv_max_campaign` (shop) | `sum(cost)`, `sum(gross_revenue)` |
| new_videos | `video` (by `video_post_time`) | `count(*)` |
| active_creators | `video` | `count(distinct affiliate_id)` |
| video_views, likes, comments, shares | `video_stat_rich_daily` ⋈ `video` | `sum(views)`, `sum(likes)`, `sum(comments)`, `sum(shares)` |
| refund_gmv | `return` | `sum(refund_subtotal)` |
| samples_applied | `sample` (by `created_at`) | `count(*)` |
| samples_approved | `sample_activity` ⋈ `sample` | `count(distinct sample_id) where new_status='AWAITING_SHIPMENT'` (time = `to_timestamp(event_timestamp)`) |
| samples_delivered | `sample_activity` ⋈ `sample` | `count(distinct sample_id) where new_status='SHIPPED'` |
| skus_live, skus_oos | `product_stat_daily` ⋈ `product` | `count(distinct product_id) filter (has_inventory)` / `filter (not has_inventory)` |
| instock_num, instock_den | `product_stat_daily` ⋈ `product` | `sum(total_revenue) filter (has_inventory)` / `sum(total_revenue)` |
| lifetime_creators | `video` | distinct `affiliate_id` whose `min(video_post_time) ≤` end of the week (cumulative snapshot) |

---

## 3. Brand Dashboard — metric tree

> The **Executive Summary** uses the same definitions for its 7 headline metrics (GMV, Video Views, CTR, CTOR, AOV, In-Stock %, Ads ROAS), shown for the report week + WoW badge.

### HEADLINE
| Metric | Source | Formula |
|---|---|---|
| GMV | `product_stat_rich_daily.gmv` | `Σ gmv` |
| GMV with Subsidies | `product_stat_rich_daily.gmv` + `line_item.platform_discount, seller_discount` | `GMV + Subsidy$` |
| Affiliate GMV | `affiliate_order.price_amount, quantity` | `Σ price_amount × quantity` |
| Ads Take Rate | `gmv_max_campaign_stat_daily.gross_revenue` ÷ `product_stat_rich_daily.gmv` | `Ad GMV ÷ GMV` |
| Subsidy Rate ⬇ | `line_item.platform_discount + seller_discount` | `Subsidy$ ÷ (GMV + Subsidy$)` |
| GPM | `gmv` ÷ `video_stat_rich_daily.views` | `GMV ÷ Views × 1,000` |
| Ads ROAS | `gmv_max_campaign_stat_daily.gross_revenue` ÷ `.cost` | `Ad GMV ÷ Ad Spend` |
| EMV | `video_stat_rich_daily.views, likes, comments, shares` | `Views/1000 × $rateV + (Likes+Comments+Shares)/1000 × $rateE` (rates set on Brand Dashboard; default $1.00 / $0.30) |
| Active Creators | `video.affiliate_id` | distinct creators who posted in the period |
| Lifetime Creators | `video.affiliate_id, video_post_time` | cumulative distinct creators through period end (snapshot) |
| Total Customers | `order.user_id` | `count(distinct user_id)` |

### AWARENESS
| Metric | Source | Formula |
|---|---|---|
| Impressions | `product_stat_rich_daily.impressions` | `Σ` |
| Video Views | `video_stat_rich_daily.views` | `Σ` |
| Total Page Views | `product_stat_rich_daily.page_views` | `Σ` |
| New Affiliate Videos | `video` (by `video_post_time`) | `count(*)` posted in the period |
| Avg Views per Affiliate Video | `video_stat_rich_daily.views` ÷ video count | `Views ÷ New Videos` |

### CONVERSION
| Metric | Source | Formula |
|---|---|---|
| Orders | `product_stat_rich_daily.orders` | `Σ` |
| CTR (PV / Impressions) | `product_stat_rich_daily.page_views` ÷ `.impressions` | `Page Views ÷ Impressions` |
| CTOR (Orders / PV) | `product_stat_rich_daily.orders` ÷ `.page_views` | `Orders ÷ Page Views` |
| Orders per 1,000 Views | `product_stat_rich_daily.orders` ÷ `video_stat_rich_daily.views` | `Orders ÷ Views × 1,000` |

### AVERAGE ORDER VALUE
| Metric | Source | Formula |
|---|---|---|
| AOV | `product_stat_rich_daily.gmv` ÷ `.orders` | `GMV ÷ Orders` |
| Units Sold | `product_stat_rich_daily.items_sold` | `Σ` |
| Units per Order | `items_sold` ÷ `orders` | `Units ÷ Orders` |
| Refund GMV ⬇ | `return.refund_subtotal` | `Σ` |
| Refund Rate ⬇ | `return.refund_subtotal` ÷ `gmv` | `Refund GMV ÷ GMV` |
| Sales-Weighted In-Stock Rate | `product_stat_daily.total_revenue` + `has_inventory` | `Σ(revenue where in-stock) ÷ Σ(revenue)` |

### AVAILABILITY
| Metric | Source | Formula |
|---|---|---|
| Late Dispatch Rate ⬇ | `order.rts_time, rts_sla_time` | `count(rts_time > rts_sla_time) ÷ count(distinct order.id)` |
| SKUs Live | `product_stat_daily.has_inventory` | distinct products in-stock at period end (snapshot) |
| SKUs Out of Stock ⬇ | `product_stat_daily.has_inventory` | distinct products out-of-stock at period end (snapshot) |

### SAMPLE FUNNEL (tree rows)
| Metric | Source | Formula |
|---|---|---|
| Samples Applied | `sample.created_at` | `count(*)` created in the period |
| Samples Approved | `sample_activity.new_status='AWAITING_SHIPMENT'` | `count(distinct sample_id)` |
| Samples Sent (Delivered) | `sample_activity.new_status='SHIPPED'` | `count(distinct sample_id)` |

**Drill-down (▸):** each ratio/composite row expands to its raw components (e.g. Ads ROAS → Ad GMV, Ad Spend; GMV → Video/Live/Card GMV; EMV → Views, Engagements, and the two $ components), each computed the same way per period.

---

## 4. Internal Dashboard — Sample Outreach Funnel

Distinct **creators** at each stage over a **trailing 28-day** window; the % badge compares to the **previous 28 days**.

| Stage | Source | Formula |
|---|---|---|
| Creators Reached | `target_collaboration_creator.affiliate_id` ⋈ `target_collaboration.shop_id` | distinct creators invited in the window |
| Creators with new sample requests | `sample.affiliate_id, created_at` | distinct creators |
| Creators with approved samples | `sample_activity.new_status='AWAITING_SHIPMENT'` | distinct creators |
| Creators awaiting content | `sample.status='CONTENT_PENDING'` | distinct creators currently pending (snapshot, not windowed) |
| Creators who posted | `video.affiliate_id, video_post_time` | distinct creators |
| Creators with sales | `affiliate_order.affiliate_id, create_time` | distinct creators |

---

## 5. Internal Dashboard — Advertising by Product

GMV Max per-product performance. Source: `gmv_max_product_stat_daily` ⋈ `gmv_max_campaign` (on `shop_id`)
⋈ `product` (`title`, `main_image_url`). Trailing 28 days vs. previous 28 days; top 30 products by cost + a TOTAL row.

| Column | Source | Formula |
|---|---|---|
| Cost ⬇ | `gmv_max_product_stat_daily.cost` | `Σ` (ad spend) |
| Revenue | `gmv_max_product_stat_daily.gross_revenue` | `Σ` (ad-attributed GMV) |
| ROI | `gross_revenue` ÷ `cost` | `Revenue ÷ Cost` |
| Orders | `gmv_max_product_stat_daily.orders` | `Σ` |
| Cost / Order ⬇ | `cost` ÷ `orders` | `Cost ÷ Orders` |
| AOV | `gross_revenue` ÷ `orders` | `Revenue ÷ Orders` |

---

## 6. Internal Dashboard — Creator Cohort Analysis

| Item | Source | Formula |
|---|---|---|
| Cohort (group month) | `video.affiliate_id, video_post_time` | the month a creator **first posted** for the brand |
| Size | `video.affiliate_id` | distinct creators first-posting that month |
| Retention Mₙ | `video` | distinct cohort creators who **posted again** in month *n* ÷ Size |
| GMV by Cohort Mₙ | `video_stat_rich_daily.gmv` (→ `video` → creator) | GMV earned in month *n* by that cohort's videos |

---

## 7. Notes & deliberate choices

- **Order universe.** GMV / Orders / Units / Impressions / Page Views come from TikTok's product analytics
  (`product_stat_rich_daily`), which counts a **smaller order universe** than the raw `order` table — chosen so
  GMV / AOV / CTR / CTOR stay internally consistent. **Total Customers** and **Late Dispatch** necessarily come
  from the raw `order` table (only source for buyer identity + dispatch SLA).
- **Subsidy** = platform + seller discounts from `line_item` (cast to numeric). If "subsidy" should mean only
  platform-funded discounts or include creator co-funded bonuses, that's a one-line change.
- **Ad source** = `gmv_max_campaign_stat_daily` / `gmv_max_product_stat_daily` (GMV Max). `advertiser_stat_daily`
  is **not** used — its `gross_revenue` is null and coverage is patchy.
- **`sample_activity.event_timestamp`** is an integer epoch → wrapped in `to_timestamp()`.
- **Dropped from the original WBR template** (not fully backed by TimescaleDB): Month Goal / % Attainment,
  all L3+ creator rows, Seller-Tier benchmarks, Halo Effect, # Hero Products, Shop Health (SPS), and
  per-product ad **Impressions / Clicks** (not available at product level in any TimescaleDB ad table).
