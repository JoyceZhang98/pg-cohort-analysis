'use client';

export function Instructions() {
  return (
    <div className="instr">
      <h2>How this report works</h2>
      <p>
        A standardized weekly business review for Pattern&rsquo;s P&amp;G TikTok Shop brands
        (New Chapter, Farmacy, Olay, Secret). Every number recalculates live from{' '}
        <b>TimescaleDB</b> — no manual input. Structure follows the WBR template:
        <b> Traffic → Conversion → Value → Availability</b>.
      </p>

      <h3>The tabs</h3>
      <ul>
        <li><b>Executive Summary</b> — all brands side by side on the week&rsquo;s headline metrics, each with a week-over-week badge.</li>
        <li><b>Brand Dashboard</b> — one brand&rsquo;s full metric tree: trailing 5 weeks, a 5-week trend, week-over-week, and month-to-date with MoM.</li>
        <li><b>Internal Dashboard</b> — the same tree rolled up across all P&amp;G brands (or a single-brand deep-dive), plus the creator Cohort Analysis.</li>
      </ul>

      <h3>How to read the comparisons</h3>
      <ul>
        <li><b>Trailing 5 weeks</b> — the five most recent complete weeks (Monday-start). The current partial week is excluded.</li>
        <li><b>WoW</b> — current week vs. the prior week. Δ is the absolute change; % is relative. Rate rows show Δ in percentage points (pp).</li>
        <li><b>MTD / MoM</b> — a week is assigned to the month its Monday falls in. MTD sums the report month&rsquo;s weeks up to the report week; MoM compares that to the prior full month.</li>
        <li><b>Colors</b> — green = improvement, red = decline. Inverse metrics (Subsidy Rate, Refund Rate, Late Dispatch, SKUs OOS) are flipped so red always means &ldquo;worse.&rdquo;</li>
        <li><b>Rates</b> (CTR, CTOR, AOV, ROAS, GPM, In-Stock) are recomputed from summed numerators and denominators for every period — never averaged.</li>
      </ul>

      <h3>Where each metric comes from (TimescaleDB)</h3>
      <ul>
        <li><b>GMV, video/live/card GMV, Impressions, Page Views, Units, Orders</b> → <code>product_stat_rich_daily</code> (TikTok shop analytics).</li>
        <li><b>Affiliate GMV</b> → <code>affiliate_order</code> · <b>Ad Spend / Ad GMV / ROAS / Take Rate</b> → <code>gmv_max_campaign_stat_daily</code>.</li>
        <li><b>Video Views, EMV, GPM, New Videos, Active/Lifetime Creators, Cohorts</b> → <code>video</code> + <code>video_stat_rich_daily</code>.</li>
        <li><b>Total Customers, Late Dispatch, Subsidy</b> → <code>order</code> + <code>line_item</code>.</li>
        <li><b>Refund GMV</b> → <code>return</code> · <b>Samples</b> → <code>sample</code> + <code>sample_activity</code> · <b>In-Stock / SKUs</b> → <code>product_stat_daily</code>.</li>
        <li><b>EMV</b> = (Video Views ÷ 1,000) × $/1k-views + ((Likes+Comments+Shares) ÷ 1,000) × $/1k-engagements. Adjust the two rates on the Brand Dashboard.</li>
      </ul>

      <h3>Notes &amp; deliberate choices</h3>
      <ul>
        <li><b>Dropped from the original template</b> (not fully backed by TimescaleDB): the Month Goal / % Attainment columns, all L3+ creator rows, Seller-Tier benchmarks, Halo Effect, # Hero Products, and Shop Health (SPS).</li>
        <li><b>Order universe:</b> GMV and Orders come from TikTok&rsquo;s product analytics (<code>product_stat_rich_daily</code>), which counts a different, smaller order universe than the raw <code>order</code> table. This keeps GMV/AOV/CTOR internally consistent. Total Customers and Late Dispatch necessarily come from the raw <code>order</code> table. Ask if you&rsquo;d rather base GMV on the order table.</li>
      </ul>
    </div>
  );
}
