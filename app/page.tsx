'use client';

import { useState } from 'react';
import { MetricTree, ExecSummary } from '@/components/wbr';
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
const wkLabel = (k: string) => { const [y, m, d] = k.split('-'); return `${m}/${d}/${y.slice(2)}`; };

export default function Page() {
  const [tab, setTab] = useState<Tab>('exec');
  const [brand, setBrand] = useState('new-chapter');
  const [internalScope, setInternalScope] = useState('all');
  const [week, setWeek] = useState<string | null>(null);
  const [weeks, setWeeks] = useState<string[]>([]);
  const [emvV, setEmvV] = useState(1.0);
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
      <label className="ctl"><span>EMV $/1,000 ENGAGEMENTS</span>
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
          <div className="controls">
            <label className="ctl"><span>BRAND</span>
              <select value={brand} onChange={e => setBrand(e.target.value)}>
                {BRANDS.map(b => <option key={b.slug} value={b.slug}>{b.label}</option>)}
              </select>
            </label>
            <WeekPicker />
            <EmvInputs />
          </div>
          <MetricTree brand={brand} week={week} emvV={emvV} emvE={emvE} onMeta={onMeta} />
        </section>
      )}

      {tab === 'internal' && (
        <section>
          <div className="controls">
            <label className="ctl"><span>SCOPE</span>
              <select value={internalScope} onChange={e => setInternalScope(e.target.value)}>
                <option value="all">Total (all P&amp;G)</option>
                {BRANDS.map(b => <option key={b.slug} value={b.slug}>{b.label} (deep-dive)</option>)}
              </select>
            </label>
            <WeekPicker />
            <EmvInputs />
          </div>
          <MetricTree brand={internalScope} week={week} emvV={emvV} emvE={emvE} onMeta={onMeta} />
          <Cohort brand={internalScope === 'all' ? 'new-chapter' : internalScope} />
        </section>
      )}
    </div>
  );
}
