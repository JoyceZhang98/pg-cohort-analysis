'use client';

type Def = [metric: string, source: string, formula: string];

const TREE: { group: string; rows: Def[] }[] = [
  {
    group: 'HEADLINE',
    rows: [
      ['GMV', 'product_stat_rich_daily.gmv', 'Σ gmv (all products of the shop)'],
      ['GMV with Subsidies', 'product_stat_rich_daily.gmv + line_item.platform_discount, seller_discount', 'GMV + TikTok Subsidy + Seller Subsidy'],
      ['TikTok Subsidy / Seller Subsidy', 'line_item.platform_discount / .seller_discount', 'platform-funded vs seller-funded discount, split'],
      ['Affiliate GMV', 'affiliate_order.price_amount, quantity', 'Σ price_amount × quantity'],
      ['Subsidy Rate', 'line_item.platform_discount', 'TikTok Subsidy ÷ (GMV + Subsidy)'],
      ['GMV channel mix', 'product_stat_rich_daily.video_gmv / live_gmv / product_card_gmv', 'GMV drill-down shows Video / Live / Product-Card GMV as % of GMV'],
      ['# of Hero Products', 'product_stat_rich_daily.gmv, orders (trailing 30d, per product)', 'count of products with ≥ $30,000 GMV OR ≥ 1,000 orders over the last 30 days (snapshot)'],
      ['GPM', 'product_stat_rich_daily.gmv ÷ video_stat_rich_daily.views', 'GMV ÷ Views × 1,000'],
      ['Ads ROAS', 'gmv_max_campaign_stat_daily.gross_revenue ÷ .cost', 'Ad GMV ÷ Ad Spend'],
      ['EMV', 'video_stat_rich_daily.views, likes, comments, shares', 'Views/1k × $rateV + (Likes+Comments+Shares) × $rateE — engagements priced per individual (default $10 /1k views, $0.30 /engagement, both editable)'],
      ['Active Creators', 'video.affiliate_id', 'distinct creators who posted in the period'],
      ['Lifetime Creators', 'video.affiliate_id, video_post_time', 'cumulative distinct creators through the period end (snapshot)'],
      ['Total Customers', 'order.user_id', 'distinct buyers'],
    ],
  },
  {
    group: 'AWARENESS (channel children ordered Video → Shop-Tab → LIVE)',
    rows: [
      ['Impressions', 'product_stat_rich_daily.impressions', 'Σ (children: Video / Shop-Tab / LIVE)'],
      ['Video Views', 'video_stat_rich_daily.views', 'Σ'],
      ['New Affiliate Videos', 'video (by video_post_time)', 'count of videos posted in the period'],
      ['Avg Views per Affiliate Video', 'video_stat_rich_daily.views ÷ distinct video_id', 'weekly views ÷ unique affiliate videos with views that week'],
      ['Ad Spend', 'gmv_max_campaign_stat_daily.cost', 'Σ (GMV Max ad cost)'],
      ['↳ Creatives by delivery status', 'gmv_max_creative_stat_daily.creative_delivery_status', 'distinct creatives in Learning vs Delivering each week, counted by each creative’s latest status that week'],
      ['Total Clicks', 'product_stat_rich_daily.page_views', 'Σ product clicks / page views (children: Video / Shop-Tab / LIVE) — placed just above Conversion'],
    ],
  },
  {
    group: 'CONVERSION',
    rows: [
      ['Orders', 'product_stat_rich_daily.orders', 'Σ'],
      ['CTR (Clicks / Impressions)', 'product_stat_rich_daily.page_views ÷ .impressions', 'Clicks ÷ Impressions'],
      ['↳ Add-to-Cart Rate (LIVE)', 'product_live_stat_rich_daily.add_to_cart_count ÷ .product_impressions', 'LIVE add-to-carts ÷ LIVE product impressions (how much traffic enters the cart; LIVE-channel only)'],
      ['CTOR (Orders / Clicks)', 'product_stat_rich_daily.orders ÷ .page_views', 'Orders ÷ Clicks'],
      ['↳ Cart→Order Conversion (LIVE)', 'product_live_stat_rich_daily.sku_orders ÷ .add_to_cart_count', 'LIVE SKU orders ÷ add-to-carts (how many carts convert to orders; LIVE-channel only)'],
    ],
  },
  {
    group: 'AVERAGE ORDER VALUE',
    rows: [
      ['AOV', 'product_stat_rich_daily.gmv ÷ .orders', 'GMV ÷ Orders'],
      ['Units Sold', 'product_stat_rich_daily.items_sold', 'Σ'],
      ['Units per Order', 'items_sold ÷ orders', 'Units ÷ Orders'],
      ['Refund GMV ⬇', 'return.refund_subtotal', 'Σ'],
      ['Refund Rate ⬇', 'return.refund_subtotal ÷ gmv', 'Refund GMV ÷ GMV'],
      ['Unit-Weighted In-Stock Rate', 'product_stat_daily.units_sold_total + has_inventory', 'Σ(units where in-stock) ÷ Σ(units) — weights each SKU by its unit sales'],
    ],
  },
  {
    group: 'AVAILABILITY',
    rows: [
      ['Late Dispatch Rate ⬇', 'order.rts_time, rts_sla_time', 'count(rts_time > rts_sla_time) ÷ distinct orders'],
      ['SKUs Live', 'product_stat_daily.has_inventory', 'distinct products in-stock (snapshot)'],
      ['SKUs Out of Stock ⬇', 'product_stat_daily.has_inventory', 'distinct products out-of-stock (snapshot)'],
    ],
  },
  {
    group: 'SAMPLE FUNNEL (tree rows)',
    rows: [
      ['Samples Applied', 'sample.created_at', 'count of samples created in the period'],
      ['Samples Approved', "sample_activity.new_status = 'AWAITING_SHIPMENT'", 'distinct samples reaching that status'],
      ['Samples Sent (Delivered)', "sample_activity.new_status = 'SHIPPED'", 'distinct samples reaching that status'],
      ['Target Plan Sends', 'target_collaboration_creator ⋈ target_collaboration.shop_id', 'creators invited via targeted collaborations in the period'],
      ['Email Outreach', '— (external, source pending)', 'placeholder — email-outreach sends not yet wired'],
    ],
  },
];

const FUNNEL: Def[] = [
  ['Creators Reached', 'target_collaboration_creator.affiliate_id ⋈ target_collaboration.shop_id', 'distinct creators invited in the window'],
  ['Creators with new sample requests', 'sample.affiliate_id, created_at', 'distinct creators'],
  ['Creators with approved samples', "sample_activity.new_status = 'AWAITING_SHIPMENT'", 'distinct creators'],
  ['Creators awaiting content', "sample.status = 'CONTENT_PENDING'", 'distinct creators currently pending (snapshot)'],
  ['Creators who posted', 'video.affiliate_id, video_post_time', 'distinct creators'],
  ['Creators with sales', 'affiliate_order.affiliate_id, create_time', 'distinct creators'],
];

const ADS: Def[] = [
  ['Cost', 'gmv_max_product_stat_daily.cost', 'Σ (ad spend)'],
  ['Revenue', 'gmv_max_product_stat_daily.gross_revenue', 'Σ (ad-attributed GMV)'],
  ['ROI', 'gross_revenue ÷ cost', 'Revenue ÷ Cost'],
  ['Orders', 'gmv_max_product_stat_daily.orders', 'Σ'],
  ['Cost / Order ⬇', 'cost ÷ orders', 'Cost ÷ Orders'],
  ['AOV', 'gross_revenue ÷ orders', 'Revenue ÷ Orders'],
];

const COHORT: Def[] = [
  ['Cohort (group month)', 'video.affiliate_id, video_post_time', "the month a creator first posted for the brand"],
  ['Size', 'video.affiliate_id', 'distinct creators first-posting that month'],
  ['Retention Mₙ', 'video', 'distinct cohort creators who posted again in month n ÷ Size'],
  ['GMV by Cohort Mₙ', 'video_stat_rich_daily.gmv (→ video → creator)', "GMV earned in month n by that cohort's videos"],
];

function DictTable({ rows }: { rows: Def[] }) {
  return (
    <div className="tablecard">
      <table className="dict">
        <thead><tr><th>Metric</th><th>TimescaleDB source</th><th>How it&rsquo;s calculated</th></tr></thead>
        <tbody>
          {rows.map(([m, s, f]) => (
            <tr key={m}><td className="dm">{m}</td><td><code>{s}</code></td><td>{f}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Instructions() {
  return (
    <div className="instr">
      <h2>How to read this report</h2>
      <p>
        A weekly business review for Pattern&rsquo;s P&amp;G TikTok Shop brands (New Chapter, Farmacy, Olay, Secret).
        Everything recalculates live from <b>TimescaleDB</b> — no manual input. Below is exactly where each metric
        comes from and how it&rsquo;s computed.
      </p>
      <ul>
        <li><b>Trailing 5 weeks</b> — the five most recent complete Monday-start weeks (the current partial week is excluded).</li>
        <li><b>WoW</b> — report week vs. the prior week. Δ is absolute (percentage points for rate rows); % is relative.</li>
        <li><b>MTD / Prior</b> — a week belongs to the month its Monday falls in. <b>MTD</b> sums the report month&rsquo;s weeks up to the report week; <b>Prior</b> is the previous full month (same basis) for comparison.</li>
        <li><b>GMV Driver Check</b> (top of Brand Dashboard) — decomposes GMV = Impressions × CTR × CTOR × AOV for this week vs. last week. The <b>biggest mover</b> is chosen by |Log Δ| (100·ln(this ÷ last)), which is symmetric for rises/falls and sums exactly to GMV&rsquo;s own change — more rigorous than raw WoW %.</li>
        <li><b>Rates</b> (CTR, CTOR, AOV, ROAS, GPM, In-Stock…) are recomputed from summed numerators &amp; denominators for each period — never averaged.</li>
        <li><b>Drill-down (▸)</b> — ratio/composite rows expand to their raw numerator/denominator components.</li>
        <li><b>Colors</b> — green = improvement, red = decline. Rows marked <b>⬇</b> are inverse (lower is better), so their colors are flipped.</li>
      </ul>

      <h3>Brand Dashboard — metric tree</h3>
      <p className="dnote">Per brand. The Executive Summary uses the same definitions for its headline metrics (GMV, Video Views, CTR, CTOR, AOV, In-Stock %, Ads ROAS, Shop Health).</p>
      {TREE.map(g => (<div key={g.group}><h4>{g.group}</h4><DictTable rows={g.rows} /></div>))}

      <h3>Internal Dashboard — Sample Outreach Funnel</h3>
      <p className="dnote">Distinct creators at each stage over a trailing 28-day window; change is vs. the previous 28 days.</p>
      <DictTable rows={FUNNEL} />

      <h3>Internal Dashboard — Advertising by Product</h3>
      <p className="dnote">GMV Max per-product performance. Source: <code>gmv_max_product_stat_daily</code> ⋈ <code>gmv_max_campaign</code> (on shop) ⋈ <code>product</code> (title + image). Trailing 28 days vs. previous 28 days.</p>
      <DictTable rows={ADS} />

      <h3>Internal Dashboard — Creator Cohort Analysis</h3>
      <DictTable rows={COHORT} />

      <h3>Notes &amp; deliberate choices</h3>
      <ul>
        <li><b>Order universe:</b> GMV / Orders / Units / Impressions / Page Views come from TikTok&rsquo;s product analytics (<code>product_stat_rich_daily</code>), which counts a smaller order universe than the raw <code>order</code> table — chosen so GMV / AOV / CTOR stay internally consistent. Total Customers and Late Dispatch necessarily come from the raw <code>order</code> table.</li>
        <li><b>Subsidy</b> = platform (TikTok-funded) + seller (seller-funded) discounts from <code>line_item</code>, now split into <b>TikTok Subsidy</b> and <b>Seller Subsidy</b>.</li>
        <li><b>Ad source</b> = <code>gmv_max_campaign_stat_daily</code> (GMV Max). <code>advertiser_stat_daily</code> is not used (its revenue is null / coverage patchy). Ad Spend lives under <b>Awareness</b>.</li>
        <li><b>Partial weeks:</b> a week column only appears once all 7 of its days have fully elapsed — in-progress or short weeks are hidden.</li>
        <li><b>Metric definitions</b> now appear on hover (the small <b>?</b> next to each metric name), not as inline text. EMV rate inputs ($/1,000 views, $/engagement) also carry hover definitions.</li>
        <li><b>Now sourced (via Supabase):</b> Monthly GMV Goal / % attainment, L3+ creator &amp; video rows, and Shop Health (SPS). <b># of Hero Products</b> is computed from TimescaleDB (≥ $10k GMV &amp; ≥ 1,000 orders, trailing 30d).</li>
        <li><b>Creative delivery status</b> (In Queue / Learning / Delivering / Not Delivering / …) drills down from Ad Spend, sourced from <code>gmv_max_creative_stat_daily.creative_delivery_status</code>.</li>
        <li><b>Still external / placeholder</b> (no source yet): Halo Effect, Email Outreach.</li>
      </ul>
    </div>
  );
}
