import { Slider } from './ui/slider';
import { SWING_COEFFICIENTS } from '../engine/swingAdapter';
import type { AppPredictionParams, VoterGroupSetting } from '../types';

export interface SwingInfo {
  largest: string;
  learned: Record<string, number>; // model's expected state-wide swing per party, pts
  lsYear: number | null;
}

interface Props {
  params: AppPredictionParams;
  onChange: (params: AppPredictionParams) => void;
  parties: string[];
  info: SwingInfo;
  advanced: boolean;
}

const pts = (x: number) => `${x > 0 ? '+' : ''}${x.toFixed(1)}`;

function SwingSlider({
  label,
  value,
  onValueChange,
  min,
  max,
  step = 0.5,
  base,
  unit = 'pts',
  hint,
}: {
  label: string;
  value: number;
  onValueChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  base?: number;
  unit?: string;
  hint?: string;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between text-sm text-neutral-300 mb-1 gap-2">
        <span>{label}</span>
        <span className="text-xs font-mono text-primary-400 whitespace-nowrap">
          {base !== undefined ? (
            <>
              <span className="text-neutral-500">model {pts(base)}</span>
              {value !== 0 && <> → {pts(base + value)}</>} {unit}
            </>
          ) : (
            <>
              {pts(value)} {unit}
            </>
          )}
        </span>
      </div>
      <Slider
        value={value}
        onValueChange={onValueChange}
        min={min}
        max={max}
        step={step}
        aria-label={label}
      />
      {hint && <p className="text-xs text-neutral-500 mt-1">{hint}</p>}
    </div>
  );
}

export default function SwingControls({ params, onChange, parties, info, advanced }: Props) {
  const set = (patch: Partial<AppPredictionParams>) => onChange({ ...params, ...patch });
  const setParty = (party: string, v: number) =>
    set({ swingParty: { ...params.swingParty, [party]: v } });
  const setGroup = (id: string, patch: Partial<VoterGroupSetting>) =>
    set({ voterGroups: params.voterGroups.map((g) => (g.id === id ? { ...g, ...patch } : g)) });
  const others = parties.filter((p) => p !== info.largest).slice(0, advanced ? 6 : 3);
  const { turnout, electorateGrowth } = SWING_COEFFICIENTS.effects;
  const [hold, holdMulti] = [SWING_COEFFICIENTS.seat.w[3], SWING_COEFFICIENTS.seat.w[4]];
  const evidence = (e: { perPoint: number; se: number }) =>
    Math.abs(e.perPoint) > 2 * e.se
      ? `History: ${pts(e.perPoint)} pts for the largest party per point.`
      : `History shows no reliable effect (${pts(e.perPoint)} ± ${e.se.toFixed(2)} pts per point), so this mostly changes nothing.`;

  return (
    <div>
      <h2 className="text-base font-semibold text-primary-300 mb-1">Voter mood</h2>
      <p className="text-xs text-neutral-500 mb-3">
        The model starts from swings learned from past elections
        {info.lsYear ? ` and the ${info.lsYear} Lok Sabha result` : ''}. Sliders add to that start,
        in points of state-wide vote share. Use them for what you know and the model cannot: opinion
        polls, a wave, a scandal.
      </p>

      <p className="text-xs text-warning bg-warning/10 border border-warning/20 rounded-lg px-2 py-1.5 mb-3">
        Watch for new parties: since 2000, parties that did not exist at the previous election took
        10% or more of the vote in about 3 of every 10 state elections. The model cannot see them.
        If one is rising, add it with the new-party tool below.
      </p>

      {info.largest && (
        <SwingSlider
          label={`${info.largest} (largest party last time): anti-incumbency`}
          value={params.swingRuling}
          onValueChange={(v) => set({ swingRuling: v })}
          min={-15}
          max={15}
          base={info.learned[info.largest] ?? 0}
        />
      )}
      {others.map((p) => (
        <SwingSlider
          key={p}
          label={p}
          value={params.swingParty[p] || 0}
          onValueChange={(v) => setParty(p, v)}
          min={-15}
          max={15}
          base={info.learned[p] ?? 0}
        />
      ))}

      {advanced && (
        <>
          <h3 className="text-sm font-semibold text-primary-300 mt-4 mb-2">Seats and turnout</h3>
          <SwingSlider
            label="Sitting MLA's party: extra pull"
            value={params.swingSittingMla}
            onValueChange={(v) => set({ swingSittingMla: v })}
            min={-10}
            max={10}
            hint={`Learned: the party holding a seat does ${pts(hold)} pts better than its state swing (${pts(hold + holdMulti)} with a multi-term MLA). Negative values model local anger at sitting MLAs.`}
          />
          <SwingSlider
            label="Turnout change vs a typical election"
            value={params.swingTurnout}
            onValueChange={(v) => set({ swingTurnout: v })}
            min={-15}
            max={15}
            hint={evidence(turnout)}
          />
          <SwingSlider
            label="New voters: electorate growth vs typical"
            value={params.swingElectorateGrowth}
            onValueChange={(v) => set({ swingElectorateGrowth: v })}
            min={-10}
            max={30}
            unit="%"
            hint={evidence(electorateGrowth)}
          />

          <h3 className="text-sm font-semibold text-primary-300 mt-4 mb-1">Voter groups</h3>
          <p className="text-xs text-neutral-500 mb-2">
            Results data has no votes by gender or age, so these are your assumptions (e.g. from a
            survey), not model output. A group that is S% of voters swinging L points to a party
            moves its state share by S×L/100 points. Groups overlap, so effects add up only
            approximately.
          </p>
          {params.voterGroups.map((g) => (
            <fieldset key={g.id} className="border border-neutral-800 rounded-lg p-3 mb-2">
              <legend className="text-xs font-medium text-neutral-300 px-1">{g.label}</legend>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-xs text-neutral-400 flex items-center gap-1">
                  Share
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={g.share}
                    onChange={(e) =>
                      setGroup(g.id, { share: Math.max(0, Math.min(100, +e.target.value || 0)) })
                    }
                    className="w-16 rounded border border-neutral-800 bg-[#1e1e1e] px-1 py-1 text-xs text-neutral-200"
                    aria-label={`${g.label} share of voters`}
                  />
                  %
                </label>
                <select
                  value={g.party}
                  onChange={(e) => setGroup(g.id, { party: e.target.value })}
                  className="flex-1 rounded border border-neutral-800 bg-[#1e1e1e] px-1 py-1 text-xs text-neutral-200 min-h-[32px]"
                  aria-label={`${g.label} swings towards`}
                >
                  <option value="">Swings towards…</option>
                  {parties.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <SwingSlider
                label="Swing within the group"
                value={g.lean}
                onValueChange={(v) => setGroup(g.id, { lean: v })}
                min={-20}
                max={20}
                hint={
                  g.party && g.lean
                    ? `${g.party} ${pts((g.share * g.lean) / 100)} pts state-wide`
                    : undefined
                }
              />
            </fieldset>
          ))}
        </>
      )}
    </div>
  );
}
