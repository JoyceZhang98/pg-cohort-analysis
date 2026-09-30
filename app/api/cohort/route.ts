import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { brandBySlug, BRANDS } from '@/lib/brands';
import { supaL3Handles } from '@/lib/supa';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Optional L3+ filter: restrict to affiliates whose username is in the L3+ handle set.
const L3F = (on: boolean, alias = 'affiliate_id') =>
  on ? `and ${alias} in (select a.id from affiliate a where lower(a.username) = any($2))` : '';
const buildSql = (l3: boolean) => `
with posts as (
  select affiliate_id, date_trunc('month', video_post_time)::date m
  from video
  where shop_id = $1 and affiliate_id is not null and video_post_time is not null
    and video_post_time < date_trunc('month', now()) + interval '1 month' ${L3F(l3)}
  group by 1, 2
),
firstm as (select affiliate_id, min(m) cohort from posts group by 1),
sizes  as (select cohort, count(*) sz from firstm group by 1),
gmv as (
  select v.affiliate_id, date_trunc('month', vsd.date)::date m, sum(vsd.gmv) g
  from video_stat_rich_daily vsd
  join video v on v.id = vsd.video_id
  where v.shop_id = $1 and v.affiliate_id is not null and vsd.gmv is not null
    and vsd.date < date_trunc('month', now()) + interval '1 month' ${L3F(l3, 'v.affiliate_id')}
  group by 1, 2
),
ret as (
  select f.cohort,
    ((extract(year from p.m) - extract(year from f.cohort)) * 12
      + (extract(month from p.m) - extract(month from f.cohort)))::int mn,
    count(distinct p.affiliate_id) active
  from posts p join firstm f using (affiliate_id)
  group by 1, 2
),
gmvc as (
  select f.cohort,
    ((extract(year from g.m) - extract(year from f.cohort)) * 12
      + (extract(month from g.m) - extract(month from f.cohort)))::int mn,
    sum(g.g) g
  from gmv g join firstm f using (affiliate_id)
  group by 1, 2
),
keys as (select cohort, mn from ret union select cohort, mn from gmvc)
select to_char(k.cohort, 'YYYY-MM') cohort, s.sz size, k.mn,
       coalesce(r.active, 0) active, coalesce(round(gc.g)::bigint, 0) gmv
from keys k join sizes s using (cohort)
left join ret  r  using (cohort, mn)
left join gmvc gc using (cohort, mn)
where k.cohort >= date_trunc('month', now()) - interval '11 months' and k.mn >= 0
order by k.cohort, k.mn;`;

// Creator cohort retention + GMV-by-cohort for one brand (shop).
//   Cohort  = calendar month a creator FIRST posted a video for the brand.
//   Active  = posted >=1 video for the brand in offset month N  -> retention grid.
//   GMV     = daily video GMV (video_stat_rich_daily) attributed to the creator,
//             bucketed by the month it was earned -> GMV-by-cohort grid.
type Row = { cohort: string; size: number; mn: number; active: number; gmv: string };

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('brand') || BRANDS[0].slug;
  const l3 = req.nextUrl.searchParams.get('l3') === '1';
  const brand = brandBySlug(slug);
  if (!brand) return NextResponse.json({ error: 'unknown brand' }, { status: 400 });

  try {
    let handles: string[] = [];
    if (l3) {
      handles = await supaL3Handles([brand.supaName]);
      if (!handles.length) return NextResponse.json({ brand: brand.label, slug, maxMonth: 0, cohorts: [], l3: true, generatedAt: new Date().toISOString() });
    }
    const params = l3 ? [brand.shopId, handles] : [brand.shopId];
    const { rows } = await pool.query<Row>(buildSql(l3), params);

    const byCohort = new Map<
      string,
      { cohort: string; size: number; retention: Record<number, number>; gmv: Record<number, number> }
    >();
    let maxMonth = 0;
    for (const r of rows) {
      const size = Number(r.size);
      let c = byCohort.get(r.cohort);
      if (!c) {
        c = { cohort: r.cohort, size, retention: {}, gmv: {} };
        byCohort.set(r.cohort, c);
      }
      const mn = Number(r.mn);
      maxMonth = Math.max(maxMonth, mn);
      c.retention[mn] = size ? Math.round((Number(r.active) / size) * 100) : 0;
      c.gmv[mn] = Number(r.gmv);
    }

    const cohorts = Array.from(byCohort.values()).sort((a, b) => a.cohort.localeCompare(b.cohort));
    return NextResponse.json({
      brand: brand.label,
      slug: brand.slug,
      maxMonth,
      cohorts,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 500 });
  }
}
