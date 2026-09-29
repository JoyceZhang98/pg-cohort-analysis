import { NextRequest, NextResponse } from 'next/server';
import { computeExecView, ExecView } from '@/lib/views';
import { cacheGet } from '@/lib/cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const week = req.nextUrl.searchParams.get('week');

  // Default view (latest week) → serve the daily precomputed snapshot.
  if (!week) {
    const hit = await cacheGet<ExecView>('exec:latest');
    if (hit) return NextResponse.json({ ...hit.payload, cachedAt: hit.updatedAt });
  }

  try {
    const view = await computeExecView(week);
    if ('error' in view) return NextResponse.json(view, { status: 200 });
    return NextResponse.json(view);
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 500 });
  }
}
