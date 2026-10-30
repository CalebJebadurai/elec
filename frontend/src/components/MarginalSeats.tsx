import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '../api';
import { partyColor, normalizeParty } from '../constants';
import { useStateSelection } from '../contexts/StateContext';
import { seatsForYear, marginHistogram, marginalByParty } from '../lib/marginal';
import Term from './Term';
import WinnableSeats from './WinnableSeats';
import type { ConstituencySwingRow } from '../types';
import DataSourceStamp from './DataSourceStamp';

export default function MarginalSeats() {
  const { selectedState, electionType } = useStateSelection();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<{ key: string; rows: ConstituencySwingRow[] } | null>(null);
  const [pickedYear, setPickedYear] = useState<number | null>(null);
  const [threshold, setThreshold] = useState(5);
  const key = `${selectedState}:${electionType}`;

  useEffect(() => {
    let cancelled = false;
    api
      .allConstituencySwings(selectedState, electionType)
      .catch(() => [] as ConstituencySwingRow[])
      .then((rows) => {
        if (!cancelled) setLoaded({ key, rows });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedState, electionType, key]);

  const rows = useMemo(() => (loaded?.key === key ? loaded.rows : []), [loaded, key]);
  const years = useMemo(() => [...new Set(rows.map((r) => r.year))].sort((a, b) => b - a), [rows]);
  const year = pickedYear && years.includes(pickedYear) ? pickedYear : years[0];
  const seats = useMemo(() => (year ? seatsForYear(rows, year) : []), [rows, year]);
  const histogram = useMemo(() => marginHistogram(seats), [seats]);
  const marginal = seats.filter((s) => s.margin < threshold);
  const byParty = useMemo(() => marginalByParty(seats, threshold), [seats, threshold]);

  if (loaded?.key !== key) {
    return <div className="animate-pulse bg-neutral-800 rounded-xl h-[50vh] my-6" />;
  }
  if (!year) return <p className="text-center text-neutral-400 py-12">No results available.</p>;

  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-white mb-1">Marginal seats</h2>
      <p className="text-sm text-neutral-400 mb-4">
        Seats won by a small <Term id="margin">margin</Term> are the ones most likely to change
        hands next time.
      </p>

      <div className="flex flex-col gap-3 mb-4 md:flex-row md:items-end">
        <label className="text-xs text-neutral-400">
          <span className="block mb-1">Election</span>
          <select
            value={year}
            onChange={(e) => setPickedYear(Number(e.target.value))}
            className="bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-md px-3 py-2 text-sm cursor-pointer min-h-[44px] md:min-h-0"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="flex-1 text-xs text-neutral-400 md:max-w-sm">
          <span className="block mb-1">Margin under {threshold}% of votes cast</span>
          <input
            type="range"
            min={1}
            max={15}
            step={0.5}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-full accent-primary-400"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-6 md:grid-cols-3">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-primary-300">{marginal.length}</div>
          <div className="text-xs text-neutral-400">
            of {seats.length} seats under {threshold}%
          </div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-primary-300">
            {seats.length ? seats[0].margin.toFixed(2) : '—'}%
          </div>
          <div className="text-xs text-neutral-400">Closest seat ({seats[0]?.name})</div>
        </div>
      </div>

      <h3 className="text-base font-semibold text-primary-400 mb-3">
        How close were the {year} contests?
      </h3>
      <div className="h-[220px] mb-6">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={histogram}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="label" stroke="#ccc" />
            <YAxis stroke="#ccc" allowDecimals={false} />
            <Tooltip contentStyle={{ background: '#1e1e2e', border: '1px solid #444' }} />
            <Bar dataKey="seats" name="Seats" fill="#5ad4ff" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {byParty.length > 0 && (
        <>
          <h3 className="text-base font-semibold text-primary-400 mb-3">By party</h3>
          <div className="overflow-x-auto mb-6">
            <table className="const-grid">
              <thead>
                <tr>
                  <th scope="col">Party</th>
                  <th scope="col">Marginal seats won</th>
                  <th scope="col">Marginal seats lost (runner-up)</th>
                </tr>
              </thead>
              <tbody>
                {byParty.map((p) => (
                  <tr key={p.party}>
                    <td>
                      <span
                        aria-hidden="true"
                        className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
                        style={{ background: partyColor(normalizeParty(p.party)) }}
                      />
                      {p.party}
                    </td>
                    <td>{p.held}</td>
                    <td>{p.secondIn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3 className="text-base font-semibold text-primary-400 mb-3">
        Seats under {threshold}% ({marginal.length})
      </h3>
      <div className="overflow-x-auto">
        <table className="const-grid">
          <thead>
            <tr>
              <th scope="col">Constituency</th>
              <th scope="col">District</th>
              <th scope="col">Winner</th>
              <th scope="col">Runner-up party</th>
              <th scope="col">Margin</th>
            </tr>
          </thead>
          <tbody>
            {marginal.map((s) => (
              <tr
                key={s.name}
                className="clickable-row"
                onClick={() =>
                  navigate(`/state/${selectedState}/constituencies/${encodeURIComponent(s.name)}`)
                }
              >
                <td>
                  <a
                    href={`/state/${selectedState}/constituencies/${encodeURIComponent(s.name)}`}
                    onClick={(e) => e.preventDefault()}
                    className="text-primary-300 hover:underline"
                  >
                    {s.name}
                  </a>
                </td>
                <td>{s.district || '—'}</td>
                <td>
                  {s.winner} ({s.winnerParty})
                </td>
                <td>{s.runnerUpParty || '—'}</td>
                <td>{s.margin.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <WinnableSeats rows={rows} year={year} stateName={selectedState} />
      <DataSourceStamp
        viewTitle={`Marginal seats, ${selectedState.replace(/_/g, ' ')} ${year}`}
        latestYear={year}
      />
    </div>
  );
}
