import { useMemo, useState } from 'react';
import { partyColor, normalizeParty } from '../constants';
import {
  summarizeConstituency,
  describeLatestResult,
  marginLabel,
} from '../lib/constituencySummary';
import { useStateSelection } from '../contexts/StateContext';
import { useMyConstituency } from '../hooks/useMyConstituency';
import CandidateHistoryCard from './CandidateHistoryCard';
import type { ConstituencyResult } from '../types';

interface Props {
  results: ConstituencyResult[];
  constituencyType?: string | null;
  electionType: string;
}

function formatYears(years: number[]): string {
  return years.join(', ');
}

/** Plain-language "who won, by how much, and who held the seat before" card. */
export default function ConstituencySummaryCard({
  results,
  constituencyType,
  electionType,
}: Props) {
  const info = useMemo(() => summarizeConstituency(results), [results]);
  const { latest, previous, partyRetained, memberReelected, representatives } = info;
  const memberTitle = electionType === 'GE' ? 'MP' : 'MLA';
  const label = marginLabel(latest?.margin_percentage);

  const { selectedState } = useStateSelection();
  const [mine, setMine] = useMyConstituency();
  const [openRep, setOpenRep] = useState<string | null>(null);
  const name = latest?.constituency_name ?? null;
  const isMine =
    !!mine &&
    mine.name === name &&
    mine.state === selectedState &&
    mine.electionType === electionType;

  if (!latest) return null;

  return (
    <section
      aria-labelledby="constituency-summary-heading"
      className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 mb-6"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 id="constituency-summary-heading" className="text-sm font-semibold text-white">
          At a glance
        </h3>
        {name && (
          <button
            type="button"
            aria-pressed={isMine}
            className="text-xs px-3 py-1.5 rounded-md border border-neutral-700 text-neutral-200 hover:border-primary-400 cursor-pointer min-h-[44px] md:min-h-0"
            onClick={() => setMine(isMine ? null : { state: selectedState, electionType, name })}
          >
            {isMine ? '★ My constituency' : '☆ Set as my constituency'}
          </button>
        )}
      </div>
      <p className="text-sm text-neutral-200 leading-relaxed">{describeLatestResult(latest)}</p>
      <div className="flex flex-wrap gap-2 mt-3 text-xs">
        {label && (
          <span className="bg-neutral-800 text-neutral-200 px-2 py-1 rounded">{label}</span>
        )}
        {partyRetained != null && previous && (
          <span className="bg-neutral-800 text-neutral-200 px-2 py-1 rounded">
            {partyRetained
              ? `${latest.winner_party} held the seat from ${previous.year}`
              : `Changed hands from ${previous.winner_party} in ${previous.year}`}
          </span>
        )}
        {memberReelected && (
          <span className="bg-neutral-800 text-neutral-200 px-2 py-1 rounded">
            Sitting {memberTitle} re-elected
          </span>
        )}
        {latest.turnout_percentage != null && (
          <span className="bg-neutral-800 text-neutral-200 px-2 py-1 rounded">
            Turnout {Number(latest.turnout_percentage).toFixed(1)}%
          </span>
        )}
        {constituencyType && constituencyType !== 'GEN' && (
          <span className="bg-neutral-800 text-neutral-200 px-2 py-1 rounded">
            Reserved ({constituencyType})
          </span>
        )}
      </div>

      {representatives.length > 0 && (
        <>
          <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mt-4 mb-2">
            Past {memberTitle}s
          </h4>
          <ul className="space-y-1">
            {representatives.map((rep) => {
              const repKey = `${rep.name}-${rep.years[0]}`;
              const open = openRep === repKey;
              return (
                <li key={repKey} className="text-xs text-neutral-200">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: partyColor(normalizeParty(rep.party)) }}
                    />
                    <span className="font-medium">{rep.name}</span>
                    <span className="text-neutral-400">{rep.party || '—'}</span>
                    <span className="ml-auto text-neutral-400 font-mono">
                      {formatYears(rep.years)}
                    </span>
                    {name && (
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setOpenRep(open ? null : repKey)}
                        className="text-primary-300 underline cursor-pointer min-h-[44px] md:min-h-0 px-1"
                      >
                        {open ? 'Hide' : 'History'}
                      </button>
                    )}
                  </div>
                  {open && name && (
                    <CandidateHistoryCard
                      state={selectedState}
                      constituency={name}
                      year={rep.years[rep.years.length - 1]}
                      electionType={electionType}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
