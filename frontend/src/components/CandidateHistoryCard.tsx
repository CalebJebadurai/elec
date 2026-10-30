import { useEffect, useState } from 'react';
import { api } from '../api';
import { partyColor, normalizeParty } from '../constants';
import Term from './Term';
import type { CandidateHistory } from '../types';

interface Props {
  state: string;
  constituency: string;
  year: number;
  electionType: string;
  position?: number;
}

/** A candidate's record across elections in this state: seats, parties, wins and switches. */
export default function CandidateHistoryCard({
  state,
  constituency,
  year,
  electionType,
  position = 1,
}: Props) {
  const [result, setResult] = useState<CandidateHistory | 'missing' | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .candidateHistory(state, constituency, year, electionType, position)
      .then((h) => !cancelled && setResult(h))
      .catch(() => !cancelled && setResult('missing'));
    return () => {
      cancelled = true;
    };
  }, [state, constituency, year, electionType, position]);

  if (result === null) return <div className="animate-pulse bg-neutral-800 rounded-lg h-20 mt-2" />;
  if (result === 'missing') {
    return (
      <p className="text-xs text-neutral-400 mt-2">
        TCPD has no linked record for this candidate, so their other contests can&apos;t be shown.
      </p>
    );
  }

  const h = result;
  return (
    <div className="mt-2 bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-xs">
      <div className="flex flex-wrap gap-2 mb-2">
        <span className="bg-neutral-800 px-2 py-1 rounded">
          {h.wins} win{h.wins === 1 ? '' : 's'} in {h.contests} contest
          {h.contests === 1 ? '' : 's'}
        </span>
        <span className="bg-neutral-800 px-2 py-1 rounded">
          {h.party_switches === 0 ? (
            'Same party throughout'
          ) : (
            <>
              {h.party_switches} party switch{h.party_switches === 1 ? '' : 'es'} (
              <Term id="turncoat">turncoat</Term>)
            </>
          )}
        </span>
        {h.contests > 1 && (
          <span className="bg-neutral-800 px-2 py-1 rounded">
            <Term id="recontest">Recontested</Term> {h.contests - 1} time
            {h.contests - 1 === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <ul className="space-y-1">
        {h.records.map((r) => (
          <li key={`${r.year}-${r.constituency_name}`} className="flex items-center gap-2">
            <span className="w-10 font-mono text-neutral-400">{r.year}</span>
            <span
              aria-hidden="true"
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: partyColor(normalizeParty(r.party)) }}
            />
            <span className="text-neutral-200">{r.party}</span>
            <span className="text-neutral-400 truncate">{r.constituency_name}</span>
            <span className="ml-auto text-neutral-300">
              {r.position === 1 ? 'Won' : r.position ? `#${r.position}` : '—'}
              {r.vote_share_percentage != null &&
                ` · ${Number(r.vote_share_percentage).toFixed(1)}%`}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-neutral-500 mt-2">
        Matched across elections by TCPD&apos;s person ID, within this state only.
      </p>
    </div>
  );
}
