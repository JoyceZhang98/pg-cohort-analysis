import { NextRequest, NextResponse } from 'next/server';
import { fetchWeekly, Measures } from '@/lib/wbr';
import { computeBrandView, computeExecView, computeBenchmarkView } from '@/lib/views';
import { cacheSet } from '@/lib/cache';
import { BRANDS } from '@/lib/brands';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function mondayOf(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
}

// Guard against caching partial data: when a hypertable is under an ETL AccessExclusiveLock its
// query times out (30s) and comes back blank while other tables still return data. Three known holes,
// each detected as "sales present but this feed empty" — we treat any as a partial fetch and must
// NOT overwrite good snapshots with it:
//   1. Order tables locked      ⇒ GMV present but zero orders.
//   2. Video-stats (vsd) locked ⇒ sales present but zero video views (zeroed Olay's Video Views).
//   3. product_stat_daily locked ⇒ sales present but zero in-stock denominator (blanked the
//      Unit-Weighted In-Stock Rate across every brand in one refresh).
function looksComplete(series: Map<string, Measures>): boolean {
  if (!series.size) return false;
  const cm = mondayOf(new Date());
  const weeks = [...series.keys()].filter(w => w < cm).sort();
  if (!weeks.length) return false;
  const m = series.get(weeks[weeks.length - 1])!;
  if (m.gmv > 0 && m.order_rows === 0) return false; // order tables likely locked
  let gmvSum = 0, viewsSum = 0, instockDen = 0;
  for (const w of weeks) { const x = series.get(w)!; gmvSum += x.gmv; viewsSum += x.video_views; instockDen += x.instock_den; }
  if (gmvSum > 0 && viewsSum === 0) return false;    // video-stats query came back blank
  if (gmvSum > 0 && instockDen === 0) return false;  // product_stat_daily (in-stock) came back blank
  return true;
}

// Sum several brands' weekly series into one (for the All-P&G rollup — avoids a fresh, heavy
// all-shops fetch, which matters when the order tables are under an ETL lock).
function sumSeries(all: Map<string, Measures>[]): Map<string, Measures> {
  const out = new Map<string, Measures>();
  for (const s of all) for (const [k, m] of s) {
    const acc = out.get(k);
    if (!acc) out.set(k, { ...m });
    else (Object.keys(m) as (keyof Measures)[]).forEach(f => { acc[f] += m[f]; });
  }
  return out;
}

// Daily precompute (Vercel Cron). Fetches each brand's weekly series ONCE (in parallel) and reuses
// it for the brand tree, the All-P&G rollup, and the Executive Summary, then writes JSON snapshots
// to the wbr_cache table so page loads read a snapshot instead of recomputing live.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    const qp = req.nextUrl.searchParams.get('secret');
    if (auth !== `Bearer ${secret}` && qp !== secret) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const t0 = Date.now();
  const stored: string[] = [];
  const failed: string[] = [];
  const skipped: string[] = [];
  const set = async (key: string, payload: unknown) => {
    (await cacheSet(key, payload)) ? stored.push(key) : failed.push(key);
  };

  try {
    // Per-brand in parallel: one fetch each, then store the brand tree; keep the series.
    const per = await Promise.all(BRANDS.map(async b => {
      try {
        const series = await fetchWeekly([b.shopId], [b.supaName]);
        const complete = looksComplete(series);
        if (complete) {
          const view = await computeBrandView(b.slug, null, 10, 0.3, series);
          if (!('error' in view)) await set(`wbr:${b.slug}:latest`, view);
          else failed.push(`wbr:${b.slug}:latest(${view.error})`);
        } else {
          skipped.push(`wbr:${b.slug}:latest`); // partial (order tables likely locked) — keep prior snapshot
        }
        return { slug: b.slug, series, complete };
      } catch (e) {
        failed.push(`wbr:${b.slug}:latest(${(e as Error).message})`);
        return { slug: b.slug, series: new Map<string, Measures>(), complete: false };
      }
    }));

    const brandSeries: Record<string, Map<string, Measures>> = {};
    per.forEach(x => { brandSeries[x.slug] = x.series; });
    const allComplete = per.every(x => x.complete);

    // All-P&G rollup + Exec — only refresh when every brand fetched cleanly, so a lock window
    // can't overwrite good rollup/exec snapshots with partial data.
    if (allComplete) {
      const allView = await computeBrandView('all', null, 10, 0.3, sumSeries(per.map(x => x.series)));
      if (!('error' in allView)) await set('wbr:all:latest', allView);
      else failed.push(`wbr:all:latest(${allView.error})`);

      const exec = await computeExecView(null, brandSeries);
      if (!('error' in exec)) await set('exec:latest', exec);
      else failed.push(`exec:latest(${exec.error})`);
    } else {
      skipped.push('wbr:all:latest', 'exec:latest');
    }

    // Benchmark views (L30D actuals vs category×tier target) — one per brand, in parallel.
    await Promise.all(BRANDS.map(async b => {
      try {
        const bv = await computeBenchmarkView(b.slug);
        if (!('error' in bv)) await set(`benchmark:${b.slug}:latest`, bv);
        else failed.push(`benchmark:${b.slug}:latest(${bv.error})`);
      } catch (e) { failed.push(`benchmark:${b.slug}:latest(${(e as Error).message})`); }
    }));

    return NextResponse.json({ ok: failed.length === 0, ms: Date.now() - t0, stored, skipped, failed });
  } catch (e) {
    return NextResponse.json({ ok: false, ms: Date.now() - t0, error: String((e as Error).message), stored, skipped, failed }, { status: 500 });
  }
}
