import type { Category } from './benchmark';

export type Brand = { slug: string; label: string; shopId: string; supaName: string; category: Category };
export type Workspace = {
  id: string; label: string; subtitle: string; rollupLabel: string;
  // Completeness guards to apply before caching a snapshot (see cron/refresh). Orders + video are
  // always guarded; these two are opt-in because a brand can legitimately have no data for them.
  requireInstock: boolean; // false when product_stat_daily is unavailable/too-slow for this shop
  requireTps: boolean;     // false when the brand runs no targeted collaborations (genuine 0)
};

// P&G brands managed by Pattern. shopId → TimescaleDB; supaName → Supabase brand_name key
// (creator-level pull + SPS + goals); category → benchmark column set (Joyce-confirmed 2026-09-29).
const PNG: Brand[] = [
  { slug: 'new-chapter', label: 'New Chapter', shopId: '019a763b-c123-7649-ae7e-844b7a608047', supaName: 'New Chapter Inc', category: 'Health' },
  { slug: 'farmacy', label: 'Farmacy', shopId: '019a75c5-69e5-7bba-9a80-cba266c7c8ac', supaName: 'Farmacy Beauty', category: 'Beauty' },
  { slug: 'olay', label: 'Olay', shopId: '019a75c7-ddd1-73ef-b7f3-f523359989b4', supaName: 'Olay Skin Care', category: 'Personal Care' },
  { slug: 'secret', label: 'Secret', shopId: '019ff469-5e79-7fb2-a160-d2e32e4395c9', supaName: 'Secret Deodorant', category: 'Personal Care' },
  { slug: 'old-spice', label: 'Old Spice', shopId: '01a0234e-3d5f-7fc6-8500-7e4ec853864b', supaName: 'Old Spice US', category: 'Personal Care' },
  // Head & Shoulders (shop 019c0e4e) intentionally NOT included — dormant in the warehouse
  // (0 recent GMV/traffic/orders/views; only historical videos). Re-add when commerce data lands.
];

// Coco & Eve — a separate client, deployed as its own dashboard instance (never mixed into the P&G
// rollup). supaName MUST be 'Coco&Eve' (no spaces) to match the creator-level pull's brand_name key.
const COCO_EVE: Brand[] = [
  { slug: 'coco-eve', label: 'Coco & Eve', shopId: '019ae6f6-a3e3-7428-bebd-0c2197f61313', supaName: 'Coco&Eve', category: 'Beauty' },
];

// One codebase, multiple dashboards. The active set is chosen at build/runtime by the
// NEXT_PUBLIC_BRAND_SET env var (default 'png'), so a second Vercel project can serve Coco & Eve
// from the same repo just by setting NEXT_PUBLIC_BRAND_SET=coco-eve.
const SETS: Record<string, { brands: Brand[]; ws: Workspace }> = {
  png: {
    brands: PNG,
    ws: { id: 'png', label: 'P&G Social Commerce', subtitle: 'All P&G TikTok Shop brands', rollupLabel: 'All P&G', requireInstock: true, requireTps: true },
  },
  'coco-eve': {
    brands: COCO_EVE,
    ws: { id: 'coco-eve', label: 'Coco & Eve Social Commerce', subtitle: 'Coco & Eve TikTok Shop', rollupLabel: 'Coco & Eve (total)', requireInstock: false, requireTps: false },
  },
};

const KEY = (process.env.NEXT_PUBLIC_BRAND_SET || 'png').toLowerCase();
const ACTIVE = SETS[KEY] ?? SETS.png;

export const BRANDS = ACTIVE.brands;
export const WORKSPACE = ACTIVE.ws;
export const SINGLE_BRAND = BRANDS.length === 1;

export function brandBySlug(slug: string) {
  return BRANDS.find((b) => b.slug === slug);
}
