import { NextRequest, NextResponse } from 'next/server';
import { computeBrandView, BrandView } from '@/lib/views';
import { cacheGet } from '@/lib/cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const brand = p.get('brand') || 'all';
  const emvV = Number(p.get('emvV') ?? '10.0');
  const emvE = Number(p.get('emvE') ?? '0.3');
  const week = p.get('week');

  // Default view (latest week, default EMV rates) → serve the daily precomputed snapshot.
  const isDefault = !week && emvV === 10 && emvE === 0.3;
  if (isDefault) {
    const hit = await cacheGet<BrandView>(`wbr:${brand}:latest`);
    if (hit) return NextResponse.json({ ...hit.payload, cachedAt: hit.updatedAt });
  }

  try {
    const view = await computeBrandView(brand, week, emvV, emvE);
    if ('error' in view) return NextResponse.json(view, { status: view.error === 'unknown brand' ? 400 : 200 });
    return NextResponse.json(view);
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 500 });
  }
}
