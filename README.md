# P&G Cohort Analysis

Creator **cohort retention** and **GMV-by-cohort** for Pattern's P&G TikTok Shop brands
(New Chapter, Farmacy, Olay, Secret). Next.js app, data pulled live from TimescaleDB.

## What it shows

Per brand, a heatmap where each row is a monthly cohort:

- **Cohort** — the month a creator *first posted a video* for the brand.
- **Size** — number of creators in that cohort.
- **M0…M11 (Creator Retention %)** — share of that cohort still posting a video *n* months later. M0 = 100%.
- **M0…M11 (GMV by Cohort)** — GMV earned in month *n* by that cohort's videos
  (`video_stat_rich_daily`, attributed to each creator).

## Data definitions

- Cohort membership / activity → `video` (`shop_id`, `affiliate_id`, `video_post_time`).
- GMV → `video_stat_rich_daily.gmv` joined to `video` via `video_id`, bucketed by earning month.
- Window → trailing 12 cohort months.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in the TimescaleDB creds
npm run dev                  # http://localhost:3021
```

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import it at https://vercel.com/new.
3. Add the same env vars from `.env.example` in **Project Settings → Environment Variables**
   (`TIMESCALE_HOST`, `TIMESCALE_PORT`, `TIMESCALE_DB`, `TIMESCALE_USER`, `TIMESCALE_PASSWORD`).
4. Deploy. The `/api/cohort` route queries TimescaleDB at request time (`force-dynamic`).

To add more brands, edit `lib/brands.ts` (slug + label + shop id) and the `BRANDS` list in `app/page.tsx`.
