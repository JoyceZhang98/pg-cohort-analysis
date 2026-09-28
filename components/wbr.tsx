'use client';

import { Fragment, useEffect, useState } from 'react';

export type Fmt = 'money' | 'int' | 'pct' | 'x' | 'ratio';

export function fmtVal(v: number | null, fmt: Fmt): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  switch (fmt) {
    case 'money': {
      const abs = Math.abs(v);
      if (abs >= 1000) return '$' + Math.round(v).toLocaleString();
      return '$' + (abs >= 100 ? Math.round(v) : v.toFixed(0));
    }
    case 'int': return Math.round(v).toLocaleString();
    case 'pct': return (v * 100).toFixed(1) + '%';
    case 'x': return v.toFixed(1) + 'x';
    case 'ratio': return v.toFixed(2);
  }
}

function fmtDelta(v: number | null, fmt: Fmt): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (fmt === 'pct') return (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + 'pp';
  if (fmt === 'x') return (v >= 0 ? '+' : '') + v.toFixed(1) + 'x';
  if (fmt === 'ratio') return (v >= 0 ? '+' : '') + v.toFixed(2);
  const r = Math.round(v);
  return r < 0 ? '(' + Math.abs(r).toLocaleString() + ')' : r.toLocaleString();
}

// green when good, red when bad; inverse flips
function deltaColor(v: number | null, inverse?: boolean): string {
  if (v === null || v === 0 || Number.isNaN(v)) return 'var(--muted)';
  const good = inverse ? v < 0 : v > 0;
  return good ? 'var(--up)' : 'var(--down)';
}

export function Spark({ values, inverse }: { values: (number | null)[]; inverse?: boolean }) {
  const pts = values.filter((v): v is number => v !== null);
  if (pts.length < 2) return <span style={{ color: 'var(--muted)' }}>—</span>;
  const min = Math.min(...pts), max = Math.max(...pts);
  const rng = max - min || 1;
  const w = 72, h = 26, pad = 3;
  const step = (w - pad * 2) / (pts.length - 1);
  const path = pts.map((v, i) => `${pad + i * step},${h - pad - ((v - min) / rng) * (h - pad * 2)}`).join(' ');
  const rising = pts[pts.length - 1] >= pts[0];
  const good = inverse ? !rising : rising;
  const color = good ? 'var(--up)' : 'var(--down)';
  const last = path.split(' ').pop()!.split(',').map(Number);
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={path} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={2.2} fill={color} />
    </svg>
  );
}

type Row = {
  label: string; fmt: Fmt; inverse?: boolean;
  weekly: (number | null)[]; wowAbs: number | null; wowPct: number | null; mtd: number | null; momPct: number | null;
  children?: Row[];
};
type Tree = { weeks: string[]; groups: { name: string; rows: Row[] }[]; reportWeek: string };
type WbrData = { brand: string; reportWeek: string; availableWeeks: string[]; tree: Tree; error?: string };

const wkLabel = (k: string) => { const [, m, d] = k.split('-'); return `${m}/${d}`; };

export function MetricTree({ brand, emvV, emvE, week, onMeta }: {
  brand: string; emvV: number; emvE: number; week: string | null;
  onMeta?: (weeks: string[], reportWeek: string) => void;
}) {
  const [data, setData] = useState<WbrData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (label: string) => setOpen(prev => {
    const n = new Set(prev); n.has(label) ? n.delete(label) : n.add(label); return n;
  });

  useEffect(() => {
    setLoading(true); setErr('');
    const q = new URLSearchParams({ brand, emvV: String(emvV), emvE: String(emvE) });
    if (week) q.set('week', week);
    fetch(`/api/wbr?${q}`).then(r => r.json()).then((d: WbrData) => {
      if (d.error) setErr(d.error);
      else { setData(d); onMeta?.(d.availableWeeks, d.reportWeek); }
    }).catch(e => setErr(String(e))).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, emvV, emvE, week]);

  if (loading) return <div className="state">Loading {brand}…</div>;
  if (err) return <div className="state err">Error: {err}</div>;
  if (!data) return null;

  const cellsFor = (r: Row) => (
    <>
      {r.weekly.map((v, i) => <td key={i} className="num">{fmtVal(v, r.fmt)}</td>)}
      <td className="num"><Spark values={r.weekly} inverse={r.inverse} /></td>
      <td className="num" style={{ color: deltaColor(r.wowAbs, r.inverse) }}>{fmtDelta(r.wowAbs, r.fmt)}</td>
      <td className="num" style={{ color: deltaColor(r.wowPct, r.inverse) }}>{r.wowPct === null ? '—' : (r.wowPct >= 0 ? '+' : '') + (r.wowPct * 100).toFixed(1) + '%'}</td>
      <td className="num strong">{fmtVal(r.mtd, r.fmt)}</td>
      <td className="num" style={{ color: deltaColor(r.momPct, r.inverse) }}>{r.momPct === null ? '—' : (r.momPct >= 0 ? '+' : '') + (r.momPct * 100).toFixed(1) + '%'}</td>
    </>
  );

  return (
    <div className="tablecard">
      <table className="wbr">
        <thead>
          <tr>
            <th className="lead" rowSpan={2}>Metric</th>
            <th colSpan={data.tree.weeks.length}>TRAILING 5 WEEKS</th>
            <th rowSpan={2}>Trend</th>
            <th colSpan={2}>WEEK OVER WEEK</th>
            <th rowSpan={2}>MTD</th>
            <th rowSpan={2}>MoM %</th>
          </tr>
          <tr>
            {data.tree.weeks.map(w => <th key={w}>{wkLabel(w)}</th>)}
            <th>Δ</th><th>%</th>
          </tr>
        </thead>
        <tbody>
          {data.tree.groups.map(g => (
            <Fragment key={g.name}>
              <tr className="grouprow"><td colSpan={data.tree.weeks.length + 5}>{g.name}</td></tr>
              {g.rows.map(r => {
                const hasKids = !!r.children?.length;
                const isOpen = open.has(r.label);
                return (
                  <Fragment key={r.label}>
                    <tr className={hasKids ? 'expandable' : ''} onClick={hasKids ? () => toggle(r.label) : undefined}>
                      <td className="lead metric">
                        {hasKids ? <span className="twist">{isOpen ? '▾' : '▸'}</span> : <span className="twist sp" />}
                        {r.label}
                      </td>
                      {cellsFor(r)}
                    </tr>
                    {hasKids && isOpen && r.children!.map(ch => (
                      <tr key={r.label + '/' + ch.label} className="childrow">
                        <td className="lead metric child">{ch.label}</td>
                        {cellsFor(ch)}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type ExecCell = { key: string; label: string; fmt: Fmt; value: number | null; delta: number | null; deltaKind: 'pct' | 'pp' };
type ExecData = { reportWeek: string; availableWeeks: string[]; metrics: { key: string; label: string; fmt: Fmt }[]; rows: { brand: string; cells: ExecCell[] }[]; error?: string };

export function ExecSummary({ week, onMeta }: { week: string | null; onMeta?: (weeks: string[], reportWeek: string) => void }) {
  const [data, setData] = useState<ExecData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  useEffect(() => {
    setLoading(true); setErr('');
    const q = new URLSearchParams(); if (week) q.set('week', week);
    fetch(`/api/wbr/exec?${q}`).then(r => r.json()).then((d: ExecData) => {
      if (d.error) setErr(d.error); else { setData(d); onMeta?.(d.availableWeeks, d.reportWeek); }
    }).catch(e => setErr(String(e))).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);
  if (loading) return <div className="state">Loading portfolio…</div>;
  if (err) return <div className="state err">Error: {err}</div>;
  if (!data) return null;
  return (
    <div className="tablecard">
      <table className="exec">
        <thead>
          <tr><th className="lead">Brand</th>{data.metrics.map(m => <th key={m.key}>{m.label}</th>)}</tr>
        </thead>
        <tbody>
          {data.rows.map(r => (
            <tr key={r.brand} className={r.brand.startsWith('TOTAL') ? 'totalrow' : ''}>
              <td className="lead metric">{r.brand}</td>
              {r.cells.map(c => (
                <td key={c.key} className="num">
                  <div className="strong">{fmtVal(c.value, c.fmt)}</div>
                  <div className="badge" style={{ color: deltaColor(c.delta) }}>
                    {c.delta === null ? '—' : c.deltaKind === 'pp'
                      ? (c.delta >= 0 ? '▲ +' : '▼ ') + (c.delta * 100).toFixed(1) + 'pp'
                      : (c.delta >= 0 ? '▲ +' : '▼ ') + (c.delta * 100).toFixed(1) + '%'}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Sample Outreach Funnel ----------
type FunnelStage = { label: string; sub: string; value: number; pct: number | null };
type FunnelData = { start: string; end: string; stages: FunnelStage[]; error?: string };

export function Funnel({ brand, week }: { brand: string; week: string | null }) {
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  useEffect(() => {
    setLoading(true); setErr('');
    const q = new URLSearchParams({ brand }); if (week) q.set('week', week);
    fetch(`/api/wbr/funnel?${q}`).then(r => r.json()).then((d: FunnelData) => { d.error ? setErr(d.error) : setData(d); })
      .catch(e => setErr(String(e))).finally(() => setLoading(false));
  }, [brand, week]);

  return (
    <div className="cohortblock">
      <div className="cohorthead">
        <h3>Sample Outreach Funnel</h3>
        {data && <span className="sub">{data.start} – {data.end} · vs previous 28 days</span>}
      </div>
      {loading && <div className="state">Loading…</div>}
      {err && <div className="state err">Error: {err}</div>}
      {!loading && !err && data && (
        <div className="funnel">
          {data.stages.map((s, i) => (
            <div className="funnelrow" key={s.label} style={{ '--i': i } as React.CSSProperties}>
              <div className="fbar" />
              <div className="fmeta"><div className="fname">{s.label}</div><div className="fsub">{s.sub}</div></div>
              <div className="fval">
                {s.value.toLocaleString()}
                {s.pct !== null && (
                  <span className="fpct" style={{ color: deltaColor(s.pct) }}> {s.pct >= 0 ? '▲' : '▼'}{Math.abs(s.pct * 100).toFixed(0)}%</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Advertising by Product ----------
type AdRow = {
  product: string;
  cost: number; costPct: number | null; revenue: number; revenuePct: number | null;
  roi: number | null; roiPct: number | null; orders: number; ordersPct: number | null;
  cpo: number | null; cpoPct: number | null; aov: number | null; aovPct: number | null;
};
type AdsData = { start: string; end: string; count: number; totals: { cost: number; revenue: number; orders: number }; rows: AdRow[]; error?: string };

function adCell(v: number | null, fmt: Fmt, p: number | null, inverse?: boolean) {
  return (
    <td className="num">
      <div className="strong">{fmtVal(v, fmt)}</div>
      {p !== null && <div className="badge" style={{ color: deltaColor(p, inverse) }}>{p >= 0 ? '▲' : '▼'}{Math.abs(p * 100).toFixed(1)}%</div>}
    </td>
  );
}

export function AdsByProduct({ brand, week }: { brand: string; week: string | null }) {
  const [data, setData] = useState<AdsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  useEffect(() => {
    setLoading(true); setErr('');
    const q = new URLSearchParams({ brand }); if (week) q.set('week', week);
    fetch(`/api/wbr/ads?${q}`).then(r => r.json()).then((d: AdsData) => { d.error ? setErr(d.error) : setData(d); })
      .catch(e => setErr(String(e))).finally(() => setLoading(false));
  }, [brand, week]);

  return (
    <div className="cohortblock">
      <div className="cohorthead">
        <h3>Advertising by Product <span className="pill">{data?.count ?? 0} products</span></h3>
        {data && <span className="sub">GMV Max · {data.start} – {data.end} · vs previous 28 days</span>}
      </div>
      {loading && <div className="state">Loading…</div>}
      {err && <div className="state err">Error: {err}</div>}
      {!loading && !err && data && (
        <div className="tablecard">
          <table className="exec ads">
            <thead>
              <tr>
                <th className="lead">Product</th><th>Cost</th><th>Revenue</th><th>ROI</th><th>Orders</th><th>Cost / Order</th><th>AOV</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map(r => (
                <tr key={r.product}>
                  <td className="lead metric">{r.product}</td>
                  {adCell(r.cost, 'money', r.costPct, true)}
                  {adCell(r.revenue, 'money', r.revenuePct)}
                  {adCell(r.roi, 'x', r.roiPct)}
                  {adCell(r.orders, 'int', r.ordersPct)}
                  {adCell(r.cpo, 'money', r.cpoPct, true)}
                  {adCell(r.aov, 'money', r.aovPct)}
                </tr>
              ))}
              <tr className="totalrow">
                <td className="lead metric">TOTAL ({data.count})</td>
                {adCell(data.totals.cost, 'money', null, true)}
                {adCell(data.totals.revenue, 'money', null)}
                {adCell(data.totals.cost ? data.totals.revenue / data.totals.cost : null, 'x', null)}
                {adCell(data.totals.orders, 'int', null)}
                {adCell(data.totals.orders ? data.totals.cost / data.totals.orders : null, 'money', null, true)}
                {adCell(data.totals.orders ? data.totals.revenue / data.totals.orders : null, 'money', null)}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
