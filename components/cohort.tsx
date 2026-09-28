'use client';

import { useEffect, useState } from 'react';

type Cohort = { cohort: string; size: number; retention: Record<number, number>; gmv: Record<number, number> };
type Data = { brand: string; maxMonth: number; cohorts: Cohort[]; generatedAt: string; error?: string };

function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}
function heat(t: number) {
  const c = Math.max(0, Math.min(1, t));
  const from = [246, 245, 255], to = [106, 92, 255];
  const rgb = from.map((f, i) => Math.round(f + (to[i] - f) * c));
  return { bg: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`, ink: c > 0.55 ? '#ffffff' : '#1e2340' };
}
function fmtGmv(v: number) {
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return '$' + (v / 1_000).toFixed(1) + 'K';
  return '$' + v;
}

export function Cohort({ brand }: { brand: string }) {
  const [view, setView] = useState<'retention' | 'gmv'>('retention');
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    setLoading(true); setErr('');
    fetch(`/api/cohort?brand=${brand}`).then(r => r.json()).then((d: Data) => {
      if (d.error) setErr(d.error); else setData(d);
    }).catch(e => setErr(String(e))).finally(() => setLoading(false));
  }, [brand]);

  const maxMonth = data?.maxMonth ?? 11;
  const months = Array.from({ length: maxMonth + 1 }, (_, i) => i);
  let gmvMax = 1;
  if (data && view === 'gmv') for (const c of data.cohorts) for (const m of months) gmvMax = Math.max(gmvMax, c.gmv[m] || 0);
  const has = (c: Cohort, m: number) => c.retention[m] !== undefined || c.gmv[m] !== undefined || m === 0;

  return (
    <div className="cohortblock">
      <div className="cohorthead">
        <h3>Creator Cohort Analysis</h3>
        <div className="toggle sm">
          <button className={view === 'retention' ? 'on' : ''} onClick={() => setView('retention')}>Retention %</button>
          <button className={view === 'gmv' ? 'on' : ''} onClick={() => setView('gmv')}>GMV by Cohort</button>
        </div>
      </div>
      <p className="hint">Creators grouped by the month they first posted a video for the brand. M0 = 100%; Mₙ = share still posting (or GMV earned) n months later.</p>
      {loading && <div className="state">Loading…</div>}
      {err && <div className="state err">Error: {err}</div>}
      {!loading && !err && data && (
        <div className="tablecard">
          <table>
            <thead><tr><th className="lead">Cohort</th><th>Size</th>{months.map(m => <th key={m}>M{m}</th>)}</tr></thead>
            <tbody>
              {data.cohorts.map(c => (
                <tr key={c.cohort}>
                  <td className="lead cohortName">{monthLabel(c.cohort)}</td>
                  <td className="size">{c.size.toLocaleString()}</td>
                  {months.map(m => {
                    if (!has(c, m)) return <td key={m}><div className="cell empty" /></td>;
                    if (view === 'retention') {
                      const v = c.retention[m] ?? 0; const { bg, ink } = heat(v / 100);
                      return <td key={m}><div className="cell" style={{ background: bg, color: ink }}>{v}%</div></td>;
                    }
                    const v = c.gmv[m] ?? 0; const { bg, ink } = heat(Math.sqrt(v / gmvMax));
                    return <td key={m}><div className="cell" style={{ background: bg, color: ink }}>{fmtGmv(v)}</div></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
