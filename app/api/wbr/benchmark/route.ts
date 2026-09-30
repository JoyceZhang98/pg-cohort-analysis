import { NextRequest, NextResponse } from 'next/server';
import { computeBenchmarkView, BenchmarkView } from '@/lib/views';
import { cacheGet } from '@/lib/cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get('brand') || 'new-chapter';

  const hit = await cacheGet<BenchmarkView>(`benchmark:${brand}:latest`);
  if (hit) return NextResponse.json({ ...hit.payload, cachedAt: hit.updatedAt });

  try {
    const view = await computeBenchmarkView(brand);
    if ('error' in view) return NextResponse.json(view, { status: view.error === 'unknown brand' ? 400 : 200 });
    return NextResponse.json(view);
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 500 });
  }
}
