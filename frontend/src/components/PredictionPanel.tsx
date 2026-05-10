import { useCallback, useState, lazy, Suspense } from 'react';
import * as Collapsible from '@radix-ui/react-collapsible';
import { AFFINITY_PRESETS, DEFAULT_PREDICTION_PARAMS } from '../constants';
import { Slider } from './ui/slider';
import { FactorSlider } from './ui/FactorSlider';
import {
  FACTOR_CATALOG,
  FACTOR_CATEGORIES,
  getFactorsByCategory,
  getAlliancePresets,
  type FactorCategory,
} from '../engine/factorConfig';
import type { AppPredictionParams, AllianceBloc } from '../types';

const SurveyImportModal = lazy(() => import('./SurveyImportModal'));

interface AffinityPresets {
  [key: string]: { label: string; weights: Record<string, number> };
}

interface PredictionPanelProps {
  params: AppPredictionParams;
  onChange: (params: AppPredictionParams) => void;
  presets?: AffinityPresets;
  topParties?: string[];
  stateName?: string | null;
}

export default function PredictionPanel({
  params,
  onChange,
  presets,
  topParties,
  stateName,
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

  const resetFactor = useCallback(
    (key: string) => {
      onChange({
        ...params,
        [key]: DEFAULT_PREDICTION_PARAMS[key as keyof AppPredictionParams] ?? 0,
      });
    },
    [params, onChange]
  );

  // Alliance management
  const [allianceName, setAllianceName] = useState('');
  const [allianceParties, setAllianceParties] = useState<Set<string>>(new Set());

  const addAlliance = useCallback(() => {
    if (!allianceName || allianceParties.size < 2) return;
    const bloc: AllianceBloc = {
      name: allianceName,
      parties: [...allianceParties],
      transferEfficiency: 0.85,
    };
    onChange({
      ...params,
      allianceConfig: [...params.allianceConfig, bloc],
    });
    setAllianceName('');
    setAllianceParties(new Set());
  }, [allianceName, allianceParties, params, onChange]);

  const removeAlliance = useCallback(
    (idx: number) => {
      onChange({
        ...params,
        allianceConfig: params.allianceConfig.filter((_, i) => i !== idx),
      });
    },
    [params, onChange]
  );

  const updateAllianceEfficiency = useCallback(
    (idx: number, efficiency: number) => {
      const updated = [...params.allianceConfig];
      updated[idx] = { ...updated[idx], transferEfficiency: efficiency };
      onChange({ ...params, allianceConfig: updated });
    },
    [params, onChange]
  );

  const toggleAllianceParty = useCallback((party: string) => {
    setAllianceParties((prev) => {
      const next = new Set(prev);
      if (next.has(party)) next.delete(party);
      else next.add(party);
      return next;
    });
  }, []);

  const loadAlliancePreset = useCallback(
    (year: string) => {
      const presets = getAlliancePresets(stateName || null);
      if (!presets || !presets[year]) return;
      onChange({
        ...params,
        allianceConfig: presets[year].map((a) => ({
          name: a.name,
          parties: [...a.parties],
          transferEfficiency: a.transferEfficiency,
        })),
      });
    },
    [stateName, params, onChange]
  );

  const alliancePresets = getAlliancePresets(stateName || null);
  const [surveyModalOpen, setSurveyModalOpen] = useState(false);

  const handleSurveyImport = useCallback(
    (imported: Partial<AppPredictionParams>) => {
      onChange({ ...params, ...imported });
    },
    [params, onChange]
  );

  const factorCategories: FactorCategory[] = [
    'turnout_mobilization',
    'incumbency_dynamics',
    'electoral_competition',
    'geographic_structural',
    'party_strength',
  ];

  const affinityKeys = [...majorParties.filter((p) => p in params.affinityWeights), 'Others'];

  return (
    <div className="w-full lg:w-80 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-4">
      {/* Prediction mode toggle */}
      <div className="flex rounded-lg border border-neutral-800 overflow-hidden">
        <button
          className={`flex-1 px-3 py-2 text-sm font-medium transition-colors min-h-[44px] ${
            params.predictionMode === 'formula'
              ? 'bg-primary-600 text-white'
              : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
          }`}
          onClick={() => update('predictionMode', 'formula')}
        >
          Formula
        </button>
        <button
          className="flex-1 px-3 py-2 text-sm font-medium bg-neutral-800 text-neutral-600 cursor-not-allowed min-h-[44px]"
          disabled
          title="ML prediction requires backend deployment (coming soon)"
        >
          ML (coming soon)
        </button>
      </div>

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

      {/* Multi-factor adjustment sections */}
      {factorCategories.map((category) => {
        const factors = getFactorsByCategory(category);
        const catInfo = FACTOR_CATEGORIES[category];
        if (factors.length === 0) return null;
        return (
          <Collapsible.Root key={category} className="border-t border-neutral-800 pt-3">
            <Collapsible.Trigger className="flex w-full items-center justify-between py-2 text-left">
              <h2 className="text-base font-semibold text-primary-300">{catInfo.label}</h2>
              <span className="text-neutral-500 text-sm">▾</span>
            </Collapsible.Trigger>
            <Collapsible.Content>
              <p className="text-xs text-neutral-500 mb-2 mt-1">{catInfo.description}</p>
              {factors.map((f) => (
                <FactorSlider
                  key={f.name}
                  factorName={f.name}
                  value={(params[f.name as keyof AppPredictionParams] as number) ?? f.defaultValue}
                  defaultValue={f.defaultValue}
                  min={f.range.min}
                  max={f.range.max}
                  step={f.step}
                  label={f.displayName}
                  tooltip={f.tooltip}
                  onValueChange={(v) => update(f.name, v)}
                  onReset={() => resetFactor(f.name)}
                />
              ))}
            </Collapsible.Content>
          </Collapsible.Root>
        );
      })}

      {/* Alliance Configuration */}
      <Collapsible.Root className="border-t border-neutral-800 pt-3">
        <Collapsible.Trigger className="flex w-full items-center justify-between py-2 text-left">
          <h2 className="text-base font-semibold text-primary-300">Alliance Configuration</h2>
          <span className="text-neutral-500 text-sm">▾</span>
        </Collapsible.Trigger>
        <Collapsible.Content>
          <div className="mt-2 space-y-3">
            {/* Alliance presets */}
            {alliancePresets && (
              <div>
                <label className="block text-sm text-neutral-300 mb-1">
                  Load Historical Alliance
                </label>
                <select
                  onChange={(e) => e.target.value && loadAlliancePreset(e.target.value)}
                  className="w-full rounded-md border border-neutral-800 bg-[#1e1e1e] px-3 py-2 text-sm text-neutral-200 focus:outline-2 focus:outline-primary-400 min-h-[44px]"
                  aria-label="Historical alliance preset"
                  defaultValue=""
                >
                  <option value="">Select year...</option>
                  {Object.keys(alliancePresets).map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Current alliances */}
            {params.allianceConfig.map((bloc, idx) => (
              <fieldset key={idx} role="group" className="border border-neutral-800 rounded-lg p-3">
                <legend className="text-sm font-medium text-primary-300 px-1">{bloc.name}</legend>
                <div className="flex flex-wrap gap-1 mb-2">
                  {bloc.parties.map((p) => (
                    <span
                      key={p}
                      className="text-xs bg-neutral-800 text-neutral-300 rounded px-2 py-1"
                    >
                      {p}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-neutral-400">Transfer Efficiency</span>
                  <span className="text-xs font-mono text-primary-400">
                    {Math.round(bloc.transferEfficiency * 100)}%
                  </span>
                </div>
                <Slider
                  value={bloc.transferEfficiency}
                  onValueChange={(v) => updateAllianceEfficiency(idx, v)}
                  min={0.5}
                  max={1}
                  step={0.05}
                  aria-label={`${bloc.name} transfer efficiency`}
                  className="mb-2"
                />
                <button
                  onClick={() => removeAlliance(idx)}
                  className="text-xs text-neutral-500 hover:text-error transition-colors min-h-[44px] min-w-[44px]"
                >
                  Remove Alliance
                </button>
              </fieldset>
            ))}

            {/* Create new alliance */}
            <div className="space-y-2">
              <label className="block text-sm text-neutral-300">New Alliance Name</label>
              <input
                type="text"
                placeholder="e.g. NDA, UPA..."
                value={allianceName}
                onChange={(e) => setAllianceName(e.target.value)}
                className="w-full rounded-md border border-neutral-800 bg-[#1e1e1e] px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-2 focus:outline-primary-400"
                maxLength={30}
              />
              <p className="text-xs text-neutral-500">Select parties for this alliance:</p>
              <div className="flex flex-wrap gap-2">
                {majorParties.map((party) => (
                  <label
                    key={party}
                    className="flex items-center gap-1.5 text-sm text-neutral-300 cursor-pointer min-h-[44px]"
                  >
                    <input
                      type="checkbox"
                      checked={allianceParties.has(party)}
                      onChange={() => toggleAllianceParty(party)}
                      className="rounded border-neutral-700 bg-neutral-800 text-primary-400 w-5 h-5"
                      aria-label={`Add ${party} to alliance`}
                    />
                    {party}
                  </label>
                ))}
              </div>
              <button
                onClick={addAlliance}
                disabled={!allianceName || allianceParties.size < 2}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              >
                Create Alliance
              </button>
            </div>
          </div>
        </Collapsible.Content>
      </Collapsible.Root>

      {/* New party configuration — collapsible on mobile */}
      <Collapsible.Root defaultOpen className="border-t border-neutral-800 pt-3">
        <Collapsible.Trigger className="flex w-full items-center justify-between py-2 text-left">
          <h2 className="text-base font-semibold text-primary-300">New Party</h2>
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
        className="w-full mt-4 rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-sm text-neutral-300 transition-colors hover:bg-neutral-700 min-h-[44px]"
        onClick={() => setSurveyModalOpen(true)}
      >
        Load Survey Data
      </button>

      <Suspense fallback={null}>
        <SurveyImportModal
          open={surveyModalOpen}
          onOpenChange={setSurveyModalOpen}
          onImport={handleSurveyImport}
        />
      </Suspense>

      <button
        className="w-full mt-4 rounded-lg border border-neutral-800 bg-transparent px-4 py-2.5 text-sm text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white min-h-[44px]"
        onClick={reset}
      >
        Reset All Parameters
      </button>
    </div>
  );
}
