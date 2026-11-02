import { Link } from 'react-router-dom';
import { COEFFICIENTS, FACTOR_CATALOG } from '../engine/factorConfig';
import { METHOD_VERSION, METHOD_CHANGELOG } from '../content/methodology';
import { useStateSelection } from '../contexts/StateContext';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="text-base font-semibold text-primary-400 mb-2">{title}</h3>
      <div className="space-y-2 text-sm text-neutral-200 leading-relaxed">{children}</div>
    </section>
  );
}

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 text-xs text-neutral-200 font-mono whitespace-pre-wrap">
      {children}
    </pre>
  );
}

export default function MethodologyPage() {
  const { selectedState } = useStateSelection();
  const stateCoeffs = COEFFICIENTS[selectedState];
  const national = COEFFICIENTS._national || {};
  const coeffStates = Object.keys(COEFFICIENTS)
    .filter((k) => k !== '_national')
    .map((k) => k.replace(/_/g, ' '));

  return (
    <div className="max-w-3xl mx-auto px-1 py-6">
      <h2 className="text-xl font-semibold text-white mb-1">How the scenario simulator works</h2>
      <p className="text-xs text-neutral-400 mb-5">
        Method version {METHOD_VERSION} · source:{' '}
        <code className="font-mono">frontend/src/engine/swingModel.ts</code> (learned model) and{' '}
        <code className="font-mono">predictionEngine.ts</code> (classic formula)
      </p>

      <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 mb-6 text-sm text-neutral-200">
        <strong>In short:</strong> the default <em>learned model</em> starts from each seat&apos;s
        last result and adds the swing that past elections suggest, then simulates 400 elections to
        show seat ranges and chances. Your sliders add to that swing. It is better than guessing but
        far from certain: it called about half of seats right in backtests, and it cannot see new
        parties, alliance changes or candidates.
      </div>

      <Section title="The learned model">
        <p>
          <strong>State-wide swing.</strong> For each party, a regression fitted on 234 pairs of
          consecutive assembly elections (1977–2023, unchanged boundaries, TCPD data) predicts the
          change in its state-wide vote share from: its size, whether it was the largest party (a
          large ruling party typically loses several points), its trend over the last two elections,
          and the Lok Sabha result held in between where one exists (the strongest single signal:
          about half of the gap carries over).
        </p>
        <p>
          <strong>Seat level.</strong> Each seat&apos;s last result plus the party&apos;s state
          swing, applied partly uniformly and partly in proportion to its local strength. Seats
          where a party ran far above its state average drift back by about a third of the gap, and
          the party holding the seat keeps about a point extra.
        </p>
        <p>
          <strong>Uncertainty.</strong> Each simulated election draws a shared state-level error per
          party and a seat-level error, sized from the model&apos;s past errors (state errors
          inflated by 1.5, chosen on 2000–2009 so that 80% ranges hold 80% of the time). Headline
          seats are the average over simulations.
        </p>
        <p>
          <strong>Sliders</strong> are in points of state-wide vote share and add to the learned
          swing. Turnout and electorate growth show no reliable effect in history, and the panel
          says so. Results data has no votes by gender or age, so voter-group sliders apply your own
          assumption: a group making up S% of voters swinging L points moves a party by S×L/100.
        </p>
      </Section>

      <Section title="How accurate is it?">
        <p>Scored only on elections the model was not fitted on:</p>
        <Formula>{`                         2000–2026 backtest   2023–26 (pre-registered,
                         (125 elections)      model v1, 13 states)
Learned model            50.5% of seats       58.4% of seats
Same party wins again    44.8%                51.2%
Classic formula          44.3%                50.6%
Largest party right      71 / 125             8 / 20 (formula: 6 / 20)
80% ranges held          80%                  66%`}</Formula>
        <p>
          The 2023–26 test was frozen and hashed before scoring (
          <code className="font-mono">datascience/swing/PREREGISTRATION-2.md</code>). Its ranges
          were too narrow, mostly because 213 seats went to parties or factions that did not exist
          at the last election. If you knew each party&apos;s true state-wide swing (from good
          polls, say) and set it with the sliders, the model would have called 56% of seats and the
          largest party in 84 of 108 elections. The sliders are where real information goes.
        </p>
        <p>
          <strong>Data:</strong> TCPD results to 2023, plus the 2023–26 assembly elections and the
          2024 Lok Sabha from ECI&apos;s statistical reports (Chhattisgarh 2023 is not yet published
          there). The 2024 Lok Sabha result lifted accuracy on the 2024–26 elections from 50.6% to
          54.5% of seats in the backtest.
        </p>
      </Section>

      <h3 className="text-lg font-semibold text-white mt-8 mb-3">Classic formula</h3>
      <p className="text-sm text-neutral-300 mb-4">
        Still available from the simulator&apos;s model switch. It was not better than &ldquo;same
        party wins again&rdquo; in either test.
      </p>

      <Section title="1. Starting point">
        <p>
          For every constituency we take each candidate&apos;s vote share in the latest general
          election (from TCPD data). Electors are scaled by the expected growth in the electoral
          roll, and expected valid votes are electors × the turnout you set.
        </p>
        <Formula>{`electors_next = electors_latest × growth
valid_votes   = electors_next × turnout%`}</Formula>
      </Section>

      <Section title="2. Anti-incumbency">
        <p>
          The party that won the seat last time loses the percentage of its own vote share that you
          set. 70% of what it loses goes to last time&apos;s runner-up; the other 30% is split
          equally among the remaining candidates. The 70/30 split is a fixed assumption, not
          measured from data.
        </p>
        <Formula>{`loss          = share_incumbent × anti_incumbency%
runner_up    += 0.7 × loss
each_other   += 0.3 × loss ÷ (number of other candidates)`}</Formula>
      </Section>

      <Section title="3. Factor sliders">
        <p>
          Each of the twelve factor sliders multiplies a party&apos;s share by a modifier. Which
          parties a factor touches (the incumbent, the runner-up, or everyone) is set in code. The
          combined modifier is capped between 0.5 and 2, and all shares are then rescaled to add up
          to 100%.
        </p>
        <Formula>{`modifier = 1 + coefficient × (slider ÷ 100) × scaling
share    = share × clamp(product of modifiers, 0.5, 2.0)`}</Formula>
        <p>
          <strong>Where the coefficients come from:</strong> the values below ship in{' '}
          <code className="font-mono">engine/data/coefficients.json</code>. A notebook (
          <code className="font-mono">datascience/notebooks/08_factor_discovery.ipynb</code>)
          describes fitting them with logistic regression, but no saved run of it produced these
          exact numbers. Treat them as illustrative defaults, not estimates. State-specific values
          exist for {coeffStates.length} states ({coeffStates.join(', ')}); other states use the
          national set.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-neutral-400 text-left">
                <th className="py-1 pr-3 font-medium">Factor</th>
                <th className="py-1 pr-3 font-medium">National</th>
                {stateCoeffs && (
                  <th className="py-1 font-medium">{selectedState.replace(/_/g, ' ')}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {FACTOR_CATALOG.map((f) => (
                <tr key={f.name} className="border-t border-neutral-800">
                  <td className="py-1 pr-3 text-neutral-200">{f.displayName}</td>
                  <td className="py-1 pr-3 font-mono text-neutral-300">
                    {national[f.name]?.toFixed(2) ?? '—'}
                  </td>
                  {stateCoeffs && (
                    <td className="py-1 font-mono text-neutral-300">
                      {stateCoeffs[f.name]?.toFixed(2) ?? '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="4. New party and alliances">
        <p>
          A hypothetical new party takes the vote share you set (statewide or per seat). The votes
          it gains are taken from existing parties in proportion to their votes × the affinity
          weight you give each, so total votes are conserved.
        </p>
        <Formula>{`loss_i = new_votes × (affinity_i × votes_i) ÷ Σ (affinity_j × votes_j)`}</Formula>
        <p>
          For an alliance, the weaker allies&apos; votes in each seat move to the strongest ally at
          the transfer efficiency you set (50–100%).
        </p>
      </Section>

      <Section title="5. Seats and ranges">
        <p>
          The top vote-getter in each constituency wins it (first past the post). The majority mark
          is half the seats, rounded down, plus one. The seat range shown for each party is not a
          statistical confidence interval: every winner gets a fixed ±3 point band, widened as
          sliders move further from zero, and seats where the band overlaps the runner-up are
          counted as could-go-either-way.
        </p>
      </Section>

      <Section title="6. What it leaves out">
        <ul className="list-disc pl-5 space-y-1">
          <li>Candidate selection, campaigns, local issues, money and media.</li>
          <li>Boundary changes: seats are matched by name to the latest election only.</li>
          <li>Any polling or survey data unless you import it yourself.</li>
          <li>Uncertainty from the data itself; ranges come only from the rule above.</li>
        </ul>
      </Section>

      <Section title="Changelog">
        <ul className="space-y-3">
          {METHOD_CHANGELOG.map((c) => (
            <li key={c.version}>
              <div className="text-xs text-neutral-400">
                v{c.version} · {c.date}
              </div>
              <ul className="list-disc pl-5">
                {c.changes.map((ch) => (
                  <li key={ch}>{ch}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Section>

      <p className="text-xs text-neutral-400">
        Terms are explained in the{' '}
        <Link to="/glossary" className="text-primary-300 underline">
          glossary
        </Link>
        . Data: Trivedi Centre for Political Data (TCPD), Ashoka University; the original
        constituency-level files are on{' '}
        <a
          href="https://lokdhaba.ashoka.edu.in/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-300 underline"
        >
          Lok Dhaba
        </a>
        .
      </p>
    </div>
  );
}
