import { NextRequest, NextResponse } from 'next/server';
import { fetchWeekly, fetchLifetimeCreators, fetchMonthGoal, getLastSupaError } from '@/lib/wbr';
import { buildTree, mondaysEndingAt } from '@/lib/wbrTree';
import { BRANDS, brandBySlug } from '@/lib/brands';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Monday (UTC) of the week containing `d`
function mondayOf(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (t.getUTCDay() + 6) % 7; // 0 = Monday
  t.setUTCDate(t.getUTCDate() - dow);
  return t.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const brand = p.get('brand') || 'all';
  const emvV = Number(p.get('emvV') ?? '10.0');
  const emvE = Number(p.get('emvE') ?? '0.3');

  let shopIds: string[];
  let supaNames: string[];
  let label: string;
  if (brand === 'all') {
    shopIds = BRANDS.map(b => b.shopId);
    supaNames = BRANDS.map(b => b.supaName);
    label = 'All P&G';
  } else {
    const b = brandBySlug(brand);
    if (!b) return NextResponse.json({ error: 'unknown brand' }, { status: 400 });
    shopIds = [b.shopId];
    supaNames = [b.supaName];
    label = b.label;
  }

  try {
    const series = await fetchWeekly(shopIds, supaNames);
    const currentMonday = mondayOf(new Date());
    const complete = [...series.keys()].filter(w => w < currentMonday).sort();
    if (complete.length === 0) return NextResponse.json({ error: 'no data' }, { status: 200 });

    const availableWeeks = complete.slice(-10).reverse();
    const reportWeek = p.get('week') && complete.includes(p.get('week')!)
      ? p.get('week')!
      : complete[complete.length - 1];

    const [lifetime, monthGoal] = await Promise.all([
      fetchLifetimeCreators(shopIds, mondaysEndingAt(reportWeek, 13)),
      fetchMonthGoal(supaNames, reportWeek.slice(0, 7)),
    ]);
    const tree = buildTree(series, lifetime, reportWeek, emvV, emvE, monthGoal);

    return NextResponse.json({ brand: label, slug: brand, reportWeek, availableWeeks, tree, supaDebug: getLastSupaError(), generatedAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 500 });
  }
}
