import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useStateSelection } from '../contexts/StateContext';
import {
  checkSeatCount,
  checkMarginRecord,
  checkWinningStreak,
  checkTurnoutRecord,
  type ClaimResult,
} from '../lib/claims';
import DataSourceStamp from './DataSourceStamp';
import type { ConstituencySwingRow, StateSwingSummary } from '../types';

type ClaimType = 'seats' | 'largest' | 'smallest' | 'streak' | 'turnout';

const CLAIM_TYPES: { value: ClaimType; label: string }[] = [
  { value: 'seats', label: 'A party won N seats in a year' },
  { value: 'largest', label: 'A seat had the biggest winning margin that year' },
  { value: 'smallest', label: 'A seat had the closest contest that year' },
  { value: 'streak', label: 'A party has won a seat in every election since a year' },
  { value: 'turnout', label: 'A year had the highest turnout ever' },
];

const VERDICT_STYLE: Record<ClaimResult['verdict'], { label: string; cls: string }> = {
  true: { label: 'Supported by the data', cls: 'border-success bg-success/10 text-success' },
  false: { label: 'Not supported by the data', cls: 'border-error bg-error/10 text-error' },
  unverifiable: {
    label: 'Cannot check',
    cls: 'border-neutral-600 bg-neutral-800 text-neutral-300',
  },
};

const fieldCls =
  'w-full bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-md px-3 py-2 text-sm min-h-[44px] cursor-pointer';

interface Loaded {
  key: string;
  rows: ConstituencySwingRow[];
  summary: StateSwingSummary[];
}

export default function ClaimCheck() {
  const { selectedState, electionType } = useStateSelection();
  const key = `${selectedState}:${electionType}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [type, setType] = useState<ClaimType>('seats');
  const [party, setParty] = useState('');
  const [seat, setSeat] = useState('');
  const [pickedYear, setPickedYear] = useState<number | null>(null);
  const [count, setCount] = useState('');
  const [result, setResult] = useState<ClaimResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.allConstituencySwings(selectedState, electionType).catch(() => []),
      api.stateSwing(selectedState, electionType).catch(() => []),
    ]).then(([rows, summary]) => {
      if (!cancelled) setLoaded({ key, rows, summary });
    });
    return () => {
      cancelled = true;
    };
  }, [selectedState, electionType, key]);

  const ready = loaded?.key === key;
  const rows = useMemo(() => (ready ? loaded.rows : []), [ready, loaded]);
  const summary = useMemo(() => (ready ? loaded.summary : []), [ready, loaded]);
  const years = useMemo(() => [...new Set(rows.map((r) => r.year))].sort((a, b) => b - a), [rows]);
  const parties = useMemo(
    () => [...new Set(summary.map((r) => r.party).filter(Boolean) as string[])].sort(),
    [summary]
  );
  const seats = useMemo(
    () => [...new Set(rows.map((r) => r.constituency_name).filter(Boolean) as string[])].sort(),
    [rows]
  );
  const year = pickedYear && years.includes(pickedYear) ? pickedYear : years[0];

  const needsParty = type === 'seats' || type === 'streak';
  const needsSeat = type === 'largest' || type === 'smallest' || type === 'streak';
  const needsCount = type === 'seats';
  const canCheck =
    !!year &&
    (!needsParty || !!party) &&
    (!needsSeat || !!seat) &&
    (!needsCount || count.trim() !== '');

  function check() {
    if (!year) return;
    if (type === 'seats') setResult(checkSeatCount(summary, party, year, Number(count)));
    else if (type === 'largest' || type === 'smallest')
      setResult(checkMarginRecord(rows, seat, year, type));
    else if (type === 'streak') setResult(checkWinningStreak(rows, seat, party, year));
    else setResult(checkTurnoutRecord(rows, year));
  }

  if (!ready) return <div className="animate-pulse bg-neutral-800 rounded-xl h-[40vh] my-6" />;

  return (
    <div className="max-w-2xl mb-8">
      <h2 className="text-lg font-semibold text-white mb-1">Claim check</h2>
      <p className="text-sm text-neutral-400 mb-4">
        Test a statement about {selectedState.replace(/_/g, ' ')} election results against the
        recorded TCPD data. It checks only what the results show; it cannot judge context or intent.
      </p>

      <div className="space-y-3 bg-neutral-900/50 border border-neutral-800 rounded-xl p-4">
        <label className="block text-xs text-neutral-400">
          <span className="block mb-1">Type of claim</span>
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value as ClaimType);
              setResult(null);
            }}
            className={fieldCls}
          >
            {CLAIM_TYPES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          {needsParty && (
            <label className="block text-xs text-neutral-400">
              <span className="block mb-1">Party</span>
              <select value={party} onChange={(e) => setParty(e.target.value)} className={fieldCls}>
                <option value="">Choose a party</option>
                {parties.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          )}
          {needsSeat && (
            <label className="block text-xs text-neutral-400">
              <span className="block mb-1">Constituency</span>
              <select value={seat} onChange={(e) => setSeat(e.target.value)} className={fieldCls}>
                <option value="">Choose a constituency</option>
                {seats.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-xs text-neutral-400">
            <span className="block mb-1">{type === 'streak' ? 'Since' : 'Election year'}</span>
            <select
              value={year}
              onChange={(e) => setPickedYear(Number(e.target.value))}
              className={fieldCls}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          {needsCount && (
            <label className="block text-xs text-neutral-400">
              <span className="block mb-1">Seats claimed</span>
              <input
                type="number"
                min={0}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className={fieldCls}
              />
            </label>
          )}
        </div>
        <button
          type="button"
          disabled={!canCheck}
          onClick={check}
          className="bg-primary-400 text-black font-semibold px-5 py-2 rounded-md text-sm min-h-[44px] hover:opacity-90 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Check claim
        </button>
      </div>

      {result && (
        <div
          role="status"
          className={`mt-4 border rounded-xl p-4 ${VERDICT_STYLE[result.verdict].cls}`}
        >
          <div className="text-xs font-semibold uppercase tracking-wide">
            {VERDICT_STYLE[result.verdict].label}
          </div>
          <p className="text-sm text-neutral-100 mt-1">{result.finding}</p>
          {result.evidence.length > 0 && (
            <ul className="mt-2 text-xs text-neutral-300 font-mono space-y-0.5">
              {result.evidence.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <DataSourceStamp viewTitle={`Claim check, ${selectedState.replace(/_/g, ' ')}`} />
    </div>
  );
}
