'use client';

type Def = [metric: string, source: string, formula: string];

const TREE: { group: string; rows: Def[] }[] = [
  {
    group: 'HEADLINE',
    rows: [
      ['GMV', 'product_stat_rich_daily.gmv', 'Σ gmv (all products of the shop)'],
      ['GMV with Subsidies', 'product_stat_rich_daily.gmv + line_item.platform_discount, seller_discount', 'GMV + Subsidy$'],
      ['Affiliate GMV', 'affiliate_order.price_amount, quantity', 'Σ price_amount × quantity'],
      ['Ads Take Rate', 'gmv_max_campaign_stat_daily.gross_revenue ÷ product_stat_rich_daily.gmv', 'Ad GMV ÷ GMV'],
      ['Subsidy Rate ⬇', 'line_item.platform_discount + seller_discount', 'Subsidy$ ÷ (GMV + Subsidy$)'],
      ['GPM', 'product_stat_rich_daily.gmv ÷ video_stat_rich_daily.views', 'GMV ÷ Views × 1,000'],
      ['Ads ROAS', 'gmv_max_campaign_stat_daily.gross_revenue ÷ .cost', 'Ad GMV ÷ Ad Spend'],
      ['EMV', 'video_stat_rich_daily.views, likes, comments, shares', 'Views/1k × $rateV + (Likes+Comments+Shares) × $rateE — engagements priced per individual (default $10 /1k views, $0.30 /engagement, both editable)'],
      ['Active Creators', 'video.affiliate_id', 'distinct creators who posted in the period'],
      ['Lifetime Creators', 'video.affiliate_id, video_post_time', 'cumulative distinct creators through the period end (snapshot)'],
      ['Total Customers', 'order.user_id', 'distinct buyers'],
    ],
  },
  {
    group: 'AWARENESS',
    rows: [
      ['Impressions', 'product_stat_rich_daily.impressions', 'Σ'],
      ['Video Views', 'video_stat_rich_daily.views', 'Σ'],
      ['Total Page Views', 'product_stat_rich_daily.page_views', 'Σ'],
      ['New Affiliate Videos', 'video (by video_post_time)', 'count of videos posted in the period'],
      ['Avg Views per Affiliate Video', 'video_stat_rich_daily.views ÷ video count', 'Views ÷ New Videos'],
    ],
  },
  {
    group: 'CONVERSION',
    rows: [
      ['Orders', 'product_stat_rich_daily.orders', 'Σ'],
      ['CTR (PV / Impressions)', 'product_stat_rich_daily.page_views ÷ .impressions', 'Page Views ÷ Impressions'],
      ['CTOR (Orders / PV)', 'product_stat_rich_daily.orders ÷ .page_views', 'Orders ÷ Page Views'],
      ['Orders per 1,000 Views', 'product_stat_rich_daily.orders ÷ video_stat_rich_daily.views', 'Orders ÷ Views × 1,000'],
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
      ['Sales-Weighted In-Stock Rate', 'product_stat_daily.total_revenue + has_inventory', 'Σ(revenue where in-stock) ÷ Σ(revenue)'],
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
      <p className="dnote">Per brand. The Executive Summary uses the same definitions for its 7 headline metrics (GMV, Video Views, CTR, CTOR, AOV, In-Stock %, Ads ROAS).</p>
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
        <li><b>Subsidy</b> = platform + seller discounts from <code>line_item</code>.</li>
        <li><b>Ad source</b> = <code>gmv_max_campaign_stat_daily</code> (GMV Max). <code>advertiser_stat_daily</code> is not used (its revenue is null / coverage patchy).</li>
        <li><b>Dropped from the original template</b> (not fully backed by TimescaleDB): Month Goal / % Attainment, all L3+ rows, Seller-Tier benchmarks, Halo Effect, # Hero Products, Shop Health (SPS), and per-product ad Impressions / Clicks.</li>
      </ul>
    </div>
  );
}
