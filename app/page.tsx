'use client';

import { useEffect, useState } from 'react';

const BRANDS = [
  { slug: 'new-chapter', label: 'New Chapter' },
  { slug: 'farmacy', label: 'Farmacy' },
  { slug: 'olay', label: 'Olay' },
  { slug: 'secret', label: 'Secret' },
];

type Cohort = {
  cohort: string;
  size: number;
  retention: Record<number, number>;
  gmv: Record<number, number>;
};
type Data = { brand: string; maxMonth: number; cohorts: Cohort[]; generatedAt: string };

// month key "2026-09" -> "September 2026"
function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

// interpolate white -> accent purple by t in [0,1]
function heat(t: number) {
  const c = Math.max(0, Math.min(1, t));
  const from = [246, 245, 255]; // #f6f5ff
  const to = [106, 92, 255]; // #6a5cff
  const rgb = from.map((f, i) => Math.round(f + (to[i] - f) * c));
  return { bg: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`, ink: c > 0.55 ? '#ffffff' : '#1e2340' };
}

function fmtGmv(v: number) {
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return '$' + (v / 1_000).toFixed(1) + 'K';
  return '$' + v;
}

export default function Page() {
  const [brand, setBrand] = useState('new-chapter');
  const [view, setView] = useState<'retention' | 'gmv'>('retention');
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    setLoading(true);
    setErr('');
    fetch(`/api/cohort?brand=${brand}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setErr(d.error);
        else setData(d);
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [brand]);

  const maxMonth = data?.maxMonth ?? 11;
  const months = Array.from({ length: maxMonth + 1 }, (_, i) => i);

  // GMV color scale: normalize to grid max with a sqrt curve for spread
  let gmvMax = 1;
  if (data && view === 'gmv') {
    for (const c of data.cohorts) for (const m of months) gmvMax = Math.max(gmvMax, c.gmv[m] || 0);
  }

  function cell(c: Cohort, m: number) {
    const elapsed = has(c, m);
    if (!elapsed) return <div className="cell empty" />;
    if (view === 'retention') {
      const v = c.retention[m] ?? 0;
      const { bg, ink } = heat(v / 100);
      return (
        <div className="cell" style={{ background: bg, color: ink }}>
          {v}%
        </div>
      );
    }
    const v = c.gmv[m] ?? 0;
    const { bg, ink } = heat(Math.sqrt(v / gmvMax));
    return (
      <div className="cell" style={{ background: bg, color: ink }}>
        {fmtGmv(v)}
      </div>
    );
  }

  // a (cohort, month) is "elapsed" if that month has passed for this cohort
  function has(c: Cohort, m: number) {
    return c.retention[m] !== undefined || c.gmv[m] !== undefined || m === 0;
  }

  return (
    <div className="wrap">
      <div className="topbar">
        <h1>Cohort Analysis</h1>
        <div className="toggle">
          <button className={view === 'retention' ? 'on' : ''} onClick={() => setView('retention')}>
            Creator Retention %
          </button>
          <button className={view === 'gmv' ? 'on' : ''} onClick={() => setView('gmv')}>
            GMV by Cohort
          </button>
        </div>
      </div>
      <p className="sub">
        Creators grouped by the month they first posted a video for the brand · data from TimescaleDB
        {data ? ` · updated ${new Date(data.generatedAt).toLocaleString('en-US')}` : ''}
      </p>

      <div className="controls">
        <div className="seg">
          {BRANDS.map((b) => (
            <button key={b.slug} className={brand === b.slug ? 'on' : ''} onClick={() => setBrand(b.slug)}>
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="state">Loading {brand}…</div>}
      {err && <div className="state err">Error: {err}</div>}

      {!loading && !err && data && (
        <>
          <div className="tablecard">
            <table>
              <thead>
                <tr>
                  <th className="lead">Cohort</th>
                  <th>Size</th>
                  {months.map((m) => (
                    <th key={m}>M{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.cohorts.map((c) => (
                  <tr key={c.cohort}>
                    <td className="lead cohortName">{monthLabel(c.cohort)}</td>
                    <td className="size">{c.size.toLocaleString()}</td>
                    {months.map((m) => (
                      <td key={m}>{cell(c, m)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="legend">
            <span>Low</span>
            <span className="swatches">
              {[0.08, 0.25, 0.45, 0.65, 0.85, 1].map((t) => (
                <span key={t} className="sw" style={{ background: heat(t).bg }} />
              ))}
            </span>
            <span>High</span>
          </div>

          <p className="hint">
            {view === 'retention'
              ? 'M0 = 100% (every creator is active in their first month). Mₙ = share of that cohort still posting a video n months later. The empty lower-right triangle is months that haven’t elapsed yet.'
              : 'Mₙ = GMV earned in month n by the videos of creators in that cohort (video_stat_rich_daily, attributed to each creator). M0 is the GMV they earned in their first month.'}
          </p>
        </>
      )}
    </div>
  );
}
