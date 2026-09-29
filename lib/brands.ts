// P&G brands managed by Pattern. shopId → TimescaleDB; supaName → Supabase brand_name key.
export const BRANDS: { slug: string; label: string; shopId: string; supaName: string }[] = [
  { slug: 'new-chapter', label: 'New Chapter', shopId: '019a763b-c123-7649-ae7e-844b7a608047', supaName: 'New Chapter Inc' },
  { slug: 'farmacy', label: 'Farmacy', shopId: '019a75c5-69e5-7bba-9a80-cba266c7c8ac', supaName: 'Farmacy Beauty' },
  { slug: 'olay', label: 'Olay', shopId: '019a75c7-ddd1-73ef-b7f3-f523359989b4', supaName: 'Olay Skin Care' },
  { slug: 'secret', label: 'Secret', shopId: '019ff469-5e79-7fb2-a160-d2e32e4395c9', supaName: 'Secret Deodorant' },
  // Head & Shoulders: active affiliate shop (019c0e4e — the empty 019bcb15 is a dead duplicate).
  // NOTE: no product_stat_rich_daily data yet → GMV/orders/impressions blank until it lands; video/L3/SPS work.
  { slug: 'head-shoulders', label: 'Head & Shoulders', shopId: '019c0e4e-7ebf-777c-b680-2a7635dd0b46', supaName: 'head&shoulders' },
  { slug: 'old-spice', label: 'Old Spice', shopId: '01a0234e-3d5f-7fc6-8500-7e4ec853864b', supaName: 'Old Spice US' },
];

export function brandBySlug(slug: string) {
  return BRANDS.find((b) => b.slug === slug);
}
