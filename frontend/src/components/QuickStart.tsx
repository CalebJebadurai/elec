import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useStateSelection } from '../contexts/StateContext';
import { useMyConstituency } from '../hooks/useMyConstituency';
import type { ConstituencySummary } from '../types';

/**
 * Two-step onboarding: pick a state, pick an assembly seat, land on its page.
 * Works without signing in.
 */
export default function QuickStart() {
  const { states, selectedState, selectState } = useStateSelection();
  const navigate = useNavigate();
  const [mine, setMine] = useMyConstituency();
  const [state, setState] = useState(mine?.state || selectedState);
  const [seat, setSeat] = useState('');
  const [loaded, setLoaded] = useState<{ state: string; rows: ConstituencySummary[] } | null>(null);
  const loading = loaded?.state !== state;

  useEffect(() => {
    if (!state) return;
    let cancelled = false;
    api
      .constituencies(state, 'AE')
      .catch(() => [] as ConstituencySummary[])
      .then((rows) => {
        if (!cancelled) setLoaded({ state, rows });
      });
    return () => {
      cancelled = true;
    };
  }, [state]);

  const sortedStates = useMemo(
    () => states.slice().sort((a, b) => a.display_name.localeCompare(b.display_name)),
    [states]
  );
  const seatNames = useMemo(
    () =>
      [
        ...new Set(
          (loaded?.rows ?? []).map((s) => s.constituency_name).filter(Boolean) as string[]
        ),
      ].sort(),
    [loaded]
  );

  function go() {
    if (!state || !seat) return;
    selectState(state);
    setMine({ state, electionType: 'AE', name: seat });
    navigate(`/state/${state}/constituencies/${encodeURIComponent(seat)}`);
  }

  return (
    <section
      aria-labelledby="quickstart-heading"
      className="relative max-w-xl mx-auto mt-8 bg-neutral-900 border border-neutral-800 rounded-2xl p-5 text-left"
    >
      <h3 id="quickstart-heading" className="text-base font-semibold text-white mb-1">
        Find your seat
      </h3>
      <p className="text-xs text-neutral-400 mb-4">
        Pick your state and assembly constituency to see who won, by how much, and who held it
        before. No sign-in needed.
      </p>
      {mine && (
        <button
          type="button"
          className="w-full text-left text-sm text-primary-300 mb-3 hover:underline cursor-pointer"
          onClick={() => {
            selectState(mine.state);
            navigate(`/state/${mine.state}/constituencies/${encodeURIComponent(mine.name)}`);
          }}
        >
          ★ Back to {mine.name} →
        </button>
      )}
      <div className="flex flex-col gap-3 md:flex-row">
        <label className="flex-1 text-xs text-neutral-400">
          <span className="block mb-1">1. State</span>
          <select
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              setSeat('');
            }}
            className="w-full bg-neutral-950 border border-neutral-700 text-neutral-200 rounded-md px-3 py-2 text-sm min-h-[44px] cursor-pointer"
          >
            {sortedStates.map((s) => (
              <option key={s.state_name} value={s.state_name}>
                {s.display_name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex-1 text-xs text-neutral-400">
          <span className="block mb-1">2. Constituency</span>
          <select
            value={seat}
            onChange={(e) => setSeat(e.target.value)}
            disabled={loading || seatNames.length === 0}
            className="w-full bg-neutral-950 border border-neutral-700 text-neutral-200 rounded-md px-3 py-2 text-sm min-h-[44px] cursor-pointer disabled:opacity-50"
          >
            <option value="">{loading ? 'Loading…' : 'Choose your seat'}</option>
            {seatNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="button"
        onClick={go}
        disabled={!seat}
        className="mt-4 w-full bg-primary-400 text-black font-semibold px-6 py-3 rounded-lg text-sm min-h-[44px] hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        See my seat →
      </button>
    </section>
  );
}
