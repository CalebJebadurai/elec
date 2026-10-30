import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { findWinnableSeats, runnerUpParties } from '../lib/winnable';
import type { ConstituencySwingRow } from '../types';

interface Props {
  rows: ConstituencySwingRow[];
  year: number;
  stateName: string;
}

/** For a chosen party: seats it lost narrowly in `year`, with its past record there. */
export default function WinnableSeats({ rows, year, stateName }: Props) {
  const navigate = useNavigate();
  const parties = useMemo(() => runnerUpParties(rows, year), [rows, year]);
  const [picked, setPicked] = useState('');
  const party = picked && parties.includes(picked) ? picked : parties[0] || '';
  const seats = useMemo(
    () => (party ? findWinnableSeats(rows, party, year) : []),
    [rows, party, year]
  );

  if (parties.length === 0) return null;

  return (
    <section aria-labelledby="winnable-heading" className="mt-8">
      <h3 id="winnable-heading" className="text-base font-semibold text-primary-400 mb-1">
        Closest losses by party
      </h3>
      <p className="text-xs text-neutral-400 mb-3">
        Seats where the chosen party came second in {year}, closest first, with the years it won
        there before and how often the seat has changed hands. This describes past results only; it
        is not a forecast.
      </p>
      <label className="block text-xs text-neutral-400 mb-3">
        <span className="block mb-1">Party</span>
        <select
          value={party}
          onChange={(e) => setPicked(e.target.value)}
          className="bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-md px-3 py-2 text-sm cursor-pointer min-h-[44px] md:min-h-0"
        >
          {parties.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <div className="overflow-x-auto">
        <table className="const-grid">
          <thead>
            <tr>
              <th scope="col">Constituency</th>
              <th scope="col">Won by</th>
              <th scope="col">Gap</th>
              <th scope="col">{party} won before</th>
              <th scope="col">Changes of hands</th>
            </tr>
          </thead>
          <tbody>
            {seats.slice(0, 50).map((s) => (
              <tr
                key={s.name}
                className="clickable-row"
                onClick={() =>
                  navigate(`/state/${stateName}/constituencies/${encodeURIComponent(s.name)}`)
                }
              >
                <td className="text-primary-300">{s.name}</td>
                <td>{s.heldBy || '—'}</td>
                <td>{s.gap.toFixed(2)}%</td>
                <td>{s.wonBefore.length ? s.wonBefore.join(', ') : '—'}</td>
                <td>{s.changesOfHands}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {seats.length > 50 && (
        <p className="text-xs text-neutral-500 mt-2">Showing the closest 50 of {seats.length}.</p>
      )}
    </section>
  );
}
