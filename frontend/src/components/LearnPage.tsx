import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TOY_SEATS, PARTIES, applySwing, tally, winner, QUIZ, type Party } from '../content/learn';

const COLORS: Record<Party, string> = { A: '#0072b2', B: '#e69f00', C: '#009e73' };

function PartyChip({ party }: { party: Party }) {
  return (
    <span
      className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-black"
      style={{ background: COLORS[party] }}
    >
      {party}
    </span>
  );
}

function Lesson({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section
      aria-labelledby={`lesson-${n}`}
      className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 mb-5"
    >
      <h3 id={`lesson-${n}`} className="text-base font-semibold text-white mb-2">
        Lesson {n}: {title}
      </h3>
      {children}
    </section>
  );
}

function OneSeatLesson() {
  const [a, setA] = useState(38);
  const rest = 100 - a;
  const shares = { A: a, B: Math.round(rest * 0.55), C: rest - Math.round(rest * 0.55) };
  const w = winner(shares);
  return (
    <Lesson n={1} title="One seat, most votes wins">
      <p className="text-sm text-neutral-300 mb-3">
        In each constituency the candidate with the <strong>most</strong> votes wins. They do not
        need more than half. Move the slider to change party A&apos;s vote share.
      </p>
      <label className="block text-xs text-neutral-400 mb-1" htmlFor="lesson1-slider">
        Party A vote share: {a}%
      </label>
      <input
        id="lesson1-slider"
        type="range"
        min={10}
        max={70}
        value={a}
        onChange={(e) => setA(Number(e.target.value))}
        className="w-full accent-primary-400 mb-3"
      />
      <ul className="space-y-1 mb-3">
        {PARTIES.map((p) => (
          <li key={p} className="flex items-center gap-2 text-sm">
            <PartyChip party={p} />
            <div className="flex-1 bg-neutral-800 rounded h-4 overflow-hidden">
              <div className="h-full" style={{ width: `${shares[p]}%`, background: COLORS[p] }} />
            </div>
            <span className="w-12 text-right font-mono text-neutral-200">{shares[p]}%</span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-neutral-200" aria-live="polite">
        Winner: <PartyChip party={w} />{' '}
        {shares[w] <= 50
          ? `with only ${shares[w]}% — less than half the votes.`
          : 'with a majority of votes.'}
      </p>
    </Lesson>
  );
}

function FiveSeatLesson() {
  const [swing, setSwing] = useState(0);
  const seats = useMemo(() => TOY_SEATS.map((s) => applySwing(s, swing)), [swing]);
  const result = useMemo(() => tally(seats), [seats]);
  return (
    <Lesson n={2} title="Why seats and votes don't match">
      <p className="text-sm text-neutral-300 mb-3">
        Here are five made-up seats. Party B wins Lakeview by a landslide, but those extra votes do
        not earn extra seats. Party A wins narrowly in several places. Use the{' '}
        <Link to="/glossary#swing" className="text-primary-300 underline">
          swing
        </Link>{' '}
        slider to move votes from B to A in every seat.
      </p>
      <label className="block text-xs text-neutral-400 mb-1" htmlFor="lesson2-slider">
        Swing from B to A: {swing > 0 ? '+' : ''}
        {swing} points
      </label>
      <input
        id="lesson2-slider"
        type="range"
        min={-10}
        max={10}
        value={swing}
        onChange={(e) => setSwing(Number(e.target.value))}
        className="w-full accent-primary-400 mb-3"
      />
      <div className="overflow-x-auto">
        <table className="w-full text-xs mb-3">
          <thead>
            <tr className="text-neutral-400 text-left">
              <th className="py-1 pr-2 font-medium">Seat</th>
              {PARTIES.map((p) => (
                <th key={p} className="py-1 pr-2 font-medium">
                  {p}
                </th>
              ))}
              <th className="py-1 font-medium">Winner</th>
            </tr>
          </thead>
          <tbody>
            {seats.map((s, i) => (
              <tr key={s.name} className="border-t border-neutral-800">
                <td className="py-1 pr-2 text-neutral-200">{s.name}</td>
                {PARTIES.map((p) => (
                  <td key={p} className="py-1 pr-2 font-mono text-neutral-300">
                    {s.shares[p]}%
                  </td>
                ))}
                <td className="py-1">
                  <PartyChip party={result.winners[i]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-3 gap-2" aria-live="polite">
        {PARTIES.map((p) => (
          <div
            key={p}
            className="bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-center"
          >
            <PartyChip party={p} />
            <div className="text-lg font-bold text-white mt-1">{result.seats[p]} seats</div>
            <div className="text-xs text-neutral-400">
              {result.voteShare[p].toFixed(1)}% of votes
            </div>
          </div>
        ))}
      </div>
    </Lesson>
  );
}

function Quiz() {
  const [picked, setPicked] = useState<Record<number, number>>({});
  const score = QUIZ.filter((q, i) => picked[i] === q.answer).length;
  return (
    <Lesson n={3} title="Check yourself">
      <ol className="space-y-4">
        {QUIZ.map((q, i) => (
          <li key={q.q}>
            <p className="text-sm text-neutral-200 mb-2">{q.q}</p>
            <div className="flex flex-col gap-2 md:flex-row md:flex-wrap" role="group">
              {q.options.map((opt, j) => {
                const chosen = picked[i] === j;
                const correct = j === q.answer;
                return (
                  <button
                    key={opt}
                    type="button"
                    aria-pressed={chosen}
                    onClick={() => setPicked((prev) => ({ ...prev, [i]: j }))}
                    className={`text-left text-xs px-3 py-2 rounded-md border min-h-[44px] cursor-pointer ${
                      chosen
                        ? correct
                          ? 'border-success bg-success/15 text-white'
                          : 'border-error bg-error/15 text-white'
                        : 'border-neutral-700 text-neutral-300 hover:border-primary-400'
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            {picked[i] !== undefined && (
              <p className="text-xs text-neutral-400 mt-2" aria-live="polite">
                {picked[i] === q.answer ? '✓ Correct. ' : '✗ Not quite. '}
                {q.why}
              </p>
            )}
          </li>
        ))}
      </ol>
      {Object.keys(picked).length === QUIZ.length && (
        <p className="text-sm text-white mt-4">
          You got {score} of {QUIZ.length}.
        </p>
      )}
    </Lesson>
  );
}

export default function LearnPage() {
  return (
    <div className="max-w-3xl mx-auto px-1 py-6 text-neutral-200">
      <h2 className="text-xl font-semibold text-white mb-1">Learn: how Indian elections are won</h2>
      <p className="text-sm text-neutral-400 mb-5">
        Three short, hands-on lessons on first-past-the-post voting. Terms are explained in the{' '}
        <Link to="/glossary" className="text-primary-300 underline">
          glossary
        </Link>
        .
      </p>
      <OneSeatLesson />
      <FiveSeatLesson />
      <Quiz />
    </div>
  );
}
