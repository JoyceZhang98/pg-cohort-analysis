'use client';

import { useState } from 'react';
import { MetricTree, ExecSummary, Funnel, AdsByProduct } from '@/components/wbr';
import { Cohort } from '@/components/cohort';
import { Instructions } from '@/components/instructions';

const BRANDS = [
  { slug: 'new-chapter', label: 'New Chapter' },
  { slug: 'farmacy', label: 'Farmacy' },
  { slug: 'olay', label: 'Olay' },
  { slug: 'secret', label: 'Secret' },
];
type Tab = 'instructions' | 'exec' | 'brand' | 'internal';
const TABS: { id: Tab; label: string }[] = [
  { id: 'instructions', label: 'Instructions' },
  { id: 'exec', label: 'Executive Summary' },
  { id: 'brand', label: 'Brand Dashboard' },
  { id: 'internal', label: 'Internal Dashboard' },
];
const wkLabel = (k: string) => {
  const start = new Date(k + 'T00:00:00Z');
  const end = new Date(start.getTime() + 6 * 864e5);
  const mo = (d: Date) => d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${mo(start)} ${start.getUTCDate()} – ${mo(end)} ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
};

export default function Page() {
  const [tab, setTab] = useState<Tab>('exec');
  const [brand, setBrand] = useState('new-chapter');
  const [internalScope, setInternalScope] = useState('all');
  const [week, setWeek] = useState<string | null>(null);
  const [weeks, setWeeks] = useState<string[]>([]);
  const [emvV, setEmvV] = useState(10.0);
  const [emvE, setEmvE] = useState(0.3);

  const onMeta = (aw: string[]) => { if (aw.length && weeks.join() !== aw.join()) setWeeks(aw); };
  const WeekPicker = () => (
    <label className="ctl"><span>REPORT WEEK (MON)</span>
      <select value={week ?? ''} onChange={e => setWeek(e.target.value || null)}>
        {week === null && <option value="">Latest complete</option>}
        {weeks.map(w => <option key={w} value={w}>{wkLabel(w)}</option>)}
      </select>
    </label>
  );
  const EmvInputs = () => (
    <>
      <label className="ctl"><span>EMV $/1,000 VIEWS</span>
        <input type="number" step="0.1" value={emvV} onChange={e => setEmvV(Number(e.target.value) || 0)} /></label>
      <label className="ctl"><span>EMV $ / ENGAGEMENT</span>
        <input type="number" step="0.05" value={emvE} onChange={e => setEmvE(Number(e.target.value) || 0)} /></label>
    </>
  );

  return (
    <div className="wrap">
      <h1>P&amp;G Social Commerce — Weekly Business Report</h1>
      <p className="sub">All P&amp;G TikTok Shop brands · recalculates live from TimescaleDB</p>

      <div className="tabs">
        {TABS.map(t => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === 'instructions' && <Instructions />}

      {tab === 'exec' && (
        <section>
          <div className="controls"><WeekPicker /></div>
          <ExecSummary week={week} onMeta={onMeta} />
        </section>
      )}

      {tab === 'brand' && (
        <section>
          <p className="sub">Traffic → Conversion → Value → Availability. Pick a brand and week — every number below recalculates live from TimescaleDB.</p>
          <div className="controls">
            <label className="ctl"><span>BRAND</span>
              <select value={brand} onChange={e => setBrand(e.target.value)}>
                {BRANDS.map(b => <option key={b.slug} value={b.slug}>{b.label}</option>)}
              </select>
            </label>
            <WeekPicker />
            <EmvInputs />
          </div>
          <div className="notebox">
            <b>EMV (Earned Media Value)</b> = (Video Views ÷ 1,000) × $/1,000-views + (Likes+Comments+Shares) × $/engagement.
            Views price CPM-style, per 1,000; engagements price per individual like/comment/share, <b>not per 1,000</b>,
            since each is its own unit of value. Adjust either rate above to see EMV recompute live. Rows with a
            {' '}<span className="twist" style={{ marginRight: 0 }}>▸</span>{' '}toggle next to their name are numerator/denominator
            ratios — click the toggle to expand the raw components behind the percentage.
          </div>
          <MetricTree brand={brand} week={week} emvV={emvV} emvE={emvE} onMeta={onMeta} />
        </section>
      )}

      {tab === 'internal' && (
        <section>
          <p className="sub">Internal ops views not on the Brand Dashboard — the sample-outreach funnel, per-product ad performance, and creator cohorts.</p>
          <div className="controls">
            <label className="ctl"><span>SCOPE</span>
              <select value={internalScope} onChange={e => setInternalScope(e.target.value)}>
                <option value="all">Total (all P&amp;G)</option>
                {BRANDS.map(b => <option key={b.slug} value={b.slug}>{b.label} (deep-dive)</option>)}
              </select>
            </label>
            <WeekPicker />
          </div>
          <Funnel brand={internalScope} week={week} />
          <AdsByProduct brand={internalScope} week={week} />
          <Cohort brand={internalScope === 'all' ? 'new-chapter' : internalScope} />
        </section>
      )}
    </div>
  );
}
