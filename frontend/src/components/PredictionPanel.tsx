import { useCallback } from 'react';
import * as Collapsible from '@radix-ui/react-collapsible';
import { AFFINITY_PRESETS, DEFAULT_PREDICTION_PARAMS } from '../constants';
import { Slider } from './ui/slider';
import type { AppPredictionParams } from '../types';

interface AffinityPresets {
  [key: string]: { label: string; weights: Record<string, number> };
}

interface PredictionPanelProps {
  params: AppPredictionParams;
  onChange: (params: AppPredictionParams) => void;
  presets?: AffinityPresets;
  topParties?: string[];
}

export default function PredictionPanel({
  params,
  onChange,
  presets,
  topParties,
}: PredictionPanelProps) {
  const activePresets = presets || AFFINITY_PRESETS;
  const majorParties =
    topParties && topParties.length > 0
      ? topParties
      : Object.keys(params.affinityWeights).filter((k) => k !== 'Others');

  const update = useCallback(
    (key: string, value: unknown) => {
      onChange({ ...params, [key]: value });
    },
    [params, onChange]
  );

  const updateAffinity = useCallback(
    (party: string, value: number) => {
      onChange({
        ...params,
        affinityWeights: { ...params.affinityWeights, [party]: value },
      });
    },
    [params, onChange]
  );

  const selectPreset = useCallback(
    (presetKey: string) => {
      const preset = activePresets[presetKey];
      if (!preset) return;
      onChange({
        ...params,
        newPartyPreset: presetKey,
        affinityWeights: { ...preset.weights },
      });
    },
    [params, onChange, activePresets]
  );

  const reset = useCallback(() => {
    onChange({ ...DEFAULT_PREDICTION_PARAMS });
  }, [onChange]);

  const affinityKeys = [...majorParties.filter((p) => p in params.affinityWeights), 'Others'];

  return (
    <div className="w-full lg:w-80 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-4">
      {/* Primary controls — always visible */}
      <div>
        <h2 className="text-base font-semibold text-primary-300 mb-3">Global Parameters</h2>

        <label className="flex items-center justify-between text-sm text-neutral-300 mb-1">
          Anti-Incumbency Factor
          <span className="text-sm font-mono text-primary-400">{params.antiIncumbencyPct}%</span>
        </label>
        <Slider
          value={params.antiIncumbencyPct}
          onValueChange={(v) => update('antiIncumbencyPct', v)}
          min={0}
          max={100}
          step={1}
          aria-label="Anti-incumbency factor percentage"
          className="mb-1"
        />
        <div className="flex justify-between text-xs text-neutral-500 mb-3">
          <span>0%</span>
          <span>100%</span>
        </div>

        <label className="block text-sm text-neutral-300 mb-1">Total Voters (Electors)</label>
        <input
          type="number"
          placeholder="Leave blank for default"
          value={params.totalElectors || ''}
          onChange={(e) => update('totalElectors', e.target.value ? +e.target.value : null)}
          className="w-full rounded-md border border-neutral-800 bg-[#1e1e1e] px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-2 focus:outline-primary-400 mb-3"
          min="0"
        />

        <label className="flex items-center justify-between text-sm text-neutral-300 mb-1">
          Expected Turnout
          <span className="text-sm font-mono text-primary-400">{params.turnoutPct}%</span>
        </label>
        <Slider
          value={params.turnoutPct}
          onValueChange={(v) => update('turnoutPct', v)}
          min={0}
          max={100}
          step={0.5}
          aria-label="Expected turnout percentage"
          className="mb-1"
        />
        <div className="flex justify-between text-xs text-neutral-500 mb-3">
          <span>0%</span>
          <span>100%</span>
        </div>
      </div>

      {/* New party configuration — collapsible on mobile */}
      <Collapsible.Root defaultOpen className="border-t border-neutral-800 pt-3">
        <Collapsible.Trigger className="flex w-full items-center justify-between py-2 text-left">
          <h2 className="text-base font-semibold text-primary-300">New Party / Third Front</h2>
          <span className="text-neutral-500 text-sm">▾</span>
        </Collapsible.Trigger>
        <Collapsible.Content>
          <label className="block text-sm text-neutral-300 mb-1 mt-2">Party Name</label>
          <input
            type="text"
            placeholder="e.g. New Party Name..."
            value={params.newPartyName}
            onChange={(e) => update('newPartyName', e.target.value)}
            className="w-full rounded-md border border-neutral-800 bg-[#1e1e1e] px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-2 focus:outline-primary-400 mb-3"
            maxLength={30}
          />

          <label
            htmlFor="new-party-color"
            className="flex items-center gap-2 text-sm text-neutral-300 mb-1"
          >
            Party Color
            <span
              className="inline-block w-4 h-4 rounded-sm border border-neutral-700"
              style={{ background: params.newPartyColor }}
            />
          </label>
          <input
            id="new-party-color"
            type="color"
            value={params.newPartyColor}
            onChange={(e) => update('newPartyColor', e.target.value)}
            className="w-full h-8 rounded-md border border-neutral-800 cursor-pointer mb-3"
          />

          <label className="block text-sm text-neutral-300 mb-1">Alliance Proximity</label>
          <select
            value={params.newPartyPreset}
            onChange={(e) => selectPreset(e.target.value)}
            className="w-full rounded-md border border-neutral-800 bg-[#1e1e1e] px-3 py-2 text-sm text-neutral-200 focus:outline-2 focus:outline-primary-400 mb-3 min-h-[44px]"
            aria-label="Alliance proximity preset"
          >
            {Object.entries(activePresets).map(([key, p]) => (
              <option key={key} value={key}>
                {p.label}
              </option>
            ))}
          </select>

          <label className="flex items-center justify-between text-sm text-neutral-300 mb-1">
            Statewide Vote Share
            <span className="text-sm font-mono text-primary-400">
              {params.newPartyStatewideVoteShare}%
            </span>
          </label>
          <Slider
            value={params.newPartyStatewideVoteShare}
            onValueChange={(v) => update('newPartyStatewideVoteShare', v)}
            min={0}
            max={100}
            step={0.5}
            aria-label="Statewide vote share percentage"
            className="mb-1"
          />
          <div className="flex justify-between text-xs text-neutral-500 mb-3">
            <span>0%</span>
            <span>100%</span>
          </div>
        </Collapsible.Content>
      </Collapsible.Root>

      {/* Affinity weights — collapsed by default */}
      <Collapsible.Root className="border-t border-neutral-800 pt-3">
        <Collapsible.Trigger className="flex w-full items-center gap-2 py-2 text-left text-sm text-neutral-300 hover:text-white transition-colors">
          <span>Affinity Weights</span>
          <span className="text-xs text-neutral-500">Who loses votes to the new party?</span>
        </Collapsible.Trigger>
        <Collapsible.Content>
          <div className="mt-2 space-y-2">
            {affinityKeys.map((party) => (
              <div key={party} className="flex items-center gap-2">
                <span className="text-sm text-neutral-300 w-20 shrink-0 truncate">{party}</span>
                <Slider
                  value={params.affinityWeights[party] || 0}
                  onValueChange={(v) => updateAffinity(party, v)}
                  min={0}
                  max={1}
                  step={0.05}
                  disabled={params.newPartyPreset !== 'custom'}
                  aria-label={`${party} affinity weight`}
                  className="flex-1"
                />
                <span className="text-xs font-mono text-neutral-400 w-10 text-right">
                  {((params.affinityWeights[party] || 0) * 100).toFixed(0)}%
                </span>
              </div>
            ))}
            {params.newPartyPreset !== 'custom' && (
              <p className="text-xs text-neutral-500 mt-1">
                Switch to &ldquo;Custom&rdquo; preset to edit weights
              </p>
            )}
          </div>
        </Collapsible.Content>
      </Collapsible.Root>

      {/* Per-constituency overrides — collapsed by default */}
      <Collapsible.Root className="border-t border-neutral-800 pt-3">
        <Collapsible.Trigger className="flex w-full items-center gap-2 py-2 text-left text-sm text-neutral-300 hover:text-white transition-colors">
          <span>Per-Constituency Overrides</span>
          <span className="text-xs text-neutral-500">Set custom vote share for specific seats</span>
        </Collapsible.Trigger>
        <Collapsible.Content>
          <div className="mt-2">
            <input
              type="text"
              placeholder="Search constituency..."
              value={''}
              onChange={() => {}}
              className="w-full rounded-md border border-neutral-800 bg-[#1e1e1e] px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-2 focus:outline-primary-400 mb-2"
            />
            <div className="space-y-1">
              {Object.entries(params.constituencyOverrides).map(([name, pct]) => (
                <div key={name} className="flex items-center gap-2">
                  <span className="text-sm text-neutral-300 flex-1 truncate">{name}</span>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    step="0.5"
                    value={pct}
                    onChange={(e) => {
                      const val = +e.target.value;
                      const next = { ...params.constituencyOverrides };
                      if (val <= 0) delete next[name];
                      else next[name] = val;
                      update('constituencyOverrides', next);
                    }}
                    className="w-16 rounded-md border border-neutral-800 bg-[#1e1e1e] px-2 py-1 text-sm text-neutral-200 text-right focus:outline-2 focus:outline-primary-400"
                  />
                  <span className="text-xs text-neutral-500">%</span>
                  <button
                    className="text-neutral-500 hover:text-error transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                    onClick={() => {
                      const next = { ...params.constituencyOverrides };
                      delete next[name];
                      update('constituencyOverrides', next);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              <p className="text-xs text-neutral-500 mt-1">
                Click any constituency in the results table to add an override
              </p>
            </div>
          </div>
        </Collapsible.Content>
      </Collapsible.Root>

      <button
        className="w-full mt-4 rounded-lg border border-neutral-800 bg-transparent px-4 py-2.5 text-sm text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white min-h-[44px]"
        onClick={reset}
      >
        Reset All Parameters
      </button>
    </div>
  );
}
