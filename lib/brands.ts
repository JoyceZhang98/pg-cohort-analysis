// P&G brands managed by Pattern, mapped to their TikTok Shop id in TimescaleDB.
export const BRANDS: { slug: string; label: string; shopId: string }[] = [
  { slug: 'new-chapter', label: 'New Chapter', shopId: '019a763b-c123-7649-ae7e-844b7a608047' },
  { slug: 'farmacy', label: 'Farmacy', shopId: '019a75c5-69e5-7bba-9a80-cba266c7c8ac' },
  { slug: 'olay', label: 'Olay', shopId: '019a75c7-ddd1-73ef-b7f3-f523359989b4' },
  { slug: 'secret', label: 'Secret', shopId: '019ff469-5e79-7fb2-a160-d2e32e4395c9' },
];

export function brandBySlug(slug: string) {
  return BRANDS.find((b) => b.slug === slug);
}
