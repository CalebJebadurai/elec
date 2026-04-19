import { useState, useCallback } from 'react';
import {
  AFFINITY_PRESETS,
  DEFAULT_PREDICTION_PARAMS,
} from '../constants';

export default function PredictionPanel({ params, onChange, presets, topParties }) {
  const activePresets = presets || AFFINITY_PRESETS;
  const majorParties = topParties && topParties.length > 0 ? topParties : Object.keys(params.affinityWeights).filter((k) => k !== 'Others');
  const [showAffinity, setShowAffinity] = useState(false);
  const [showOverrides, setShowOverrides] = useState(false);
  const [overrideSearch, setOverrideSearch] = useState('');

  const update = useCallback(
    (key, value) => {
      onChange({ ...params, [key]: value });
    },
    [params, onChange]
  );

  const updateAffinity = useCallback(
    (party, value) => {
      onChange({
        ...params,
        affinityWeights: { ...params.affinityWeights, [party]: value },
      });
    },
    [params, onChange]
  );

  const selectPreset = useCallback(
    (presetKey) => {
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
    <div className="pred-panel">
      <div className="pred-section">
        <h3>Global Parameters</h3>

        <label className="pred-label">
          Anti-Incumbency Factor
          <span className="pred-value">{params.antiIncumbencyPct}%</span>
        </label>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={params.antiIncumbencyPct}
          onChange={(e) => update('antiIncumbencyPct', +e.target.value)}
          className="pred-slider"
        />
        <div className="pred-range-labels">
          <span>0%</span><span>100%</span>
        </div>

        <label className="pred-label">
          Total Voters (Electors)
        </label>
        <input
          type="number"
          placeholder="Leave blank for default"
          value={params.totalElectors || ''}
          onChange={(e) => update('totalElectors', e.target.value ? +e.target.value : null)}
          className="pred-input"
          min="0"
        />

        <label className="pred-label">
          Expected Turnout
          <span className="pred-value">{params.turnoutPct}%</span>
        </label>
        <input
          type="range"
          min="0"
          max="100"
          step="0.5"
          value={params.turnoutPct}
          onChange={(e) => update('turnoutPct', +e.target.value)}
          className="pred-slider"
        />
        <div className="pred-range-labels">
          <span>0%</span><span>100%</span>
        </div>
      </div>

      <div className="pred-section">
        <h3>New Party / Third Front</h3>

        <label className="pred-label">Party Name</label>
        <input
          type="text"
          placeholder="e.g. New Party Name..."
          value={params.newPartyName}
          onChange={(e) => update('newPartyName', e.target.value)}
          className="pred-input"
          maxLength={30}
        />

        <label className="pred-label">
          Party Color
          <span
            className="color-preview"
            style={{ background: params.newPartyColor }}
          />
        </label>
        <input
          type="color"
          value={params.newPartyColor}
          onChange={(e) => update('newPartyColor', e.target.value)}
          className="pred-color"
        />

        <label className="pred-label">Alliance Proximity</label>
        <select
          value={params.newPartyPreset}
          onChange={(e) => selectPreset(e.target.value)}
          className="pred-select"
        >
          {Object.entries(activePresets).map(([key, p]) => (
            <option key={key} value={key}>
              {p.label}
            </option>
          ))}
        </select>

        <label className="pred-label">
          Statewide Vote Share
          <span className="pred-value">{params.newPartyStatewideVoteShare}%</span>
        </label>
        <input
          type="range"
          min="0"
          max="40"
          step="0.5"
          value={params.newPartyStatewideVoteShare}
          onChange={(e) => update('newPartyStatewideVoteShare', +e.target.value)}
          className="pred-slider"
        />
        <div className="pred-range-labels">
          <span>0%</span><span>40%</span>
        </div>
      </div>

      <div className="pred-section">
        <button
          className="pred-toggle"
          onClick={() => setShowAffinity(!showAffinity)}
        >
          {showAffinity ? '▾' : '▸'} Affinity Weights
          <span className="pred-hint">Who loses votes to the new party?</span>
        </button>

        {showAffinity && (
          <div className="affinity-grid">
            {affinityKeys.map((party) => (
              <div key={party} className="affinity-row">
                <span className="affinity-party">{party}</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={params.affinityWeights[party] || 0}
                  onChange={(e) => updateAffinity(party, +e.target.value)}
                  className="pred-slider affinity-slider"
                  disabled={params.newPartyPreset !== 'custom'}
                />
                <span className="affinity-val">
                  {((params.affinityWeights[party] || 0) * 100).toFixed(0)}%
                </span>
              </div>
            ))}
            {params.newPartyPreset !== 'custom' && (
              <p className="pred-hint">Switch to "Custom" preset to edit weights</p>
            )}
          </div>
        )}
      </div>

      <div className="pred-section">
        <button
          className="pred-toggle"
          onClick={() => setShowOverrides(!showOverrides)}
        >
          {showOverrides ? '▾' : '▸'} Per-Constituency Overrides
          <span className="pred-hint">Set custom vote share for specific seats</span>
        </button>

        {showOverrides && (
          <div className="overrides-panel">
            <input
              type="text"
              placeholder="Search constituency..."
              value={overrideSearch}
              onChange={(e) => setOverrideSearch(e.target.value)}
              className="pred-input"
            />
            <div className="overrides-list">
              {Object.entries(params.constituencyOverrides).map(([name, pct]) => (
                <div key={name} className="override-row">
                  <span className="override-name">{name}</span>
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
                    className="override-input"
                  />
                  <span className="override-pct">%</span>
                  <button
                    className="override-remove"
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
              <p className="pred-hint">
                Click any constituency in the results table to add an override
              </p>
            </div>
          </div>
        )}
      </div>

      <button className="pred-reset" onClick={reset}>
        Reset All Parameters
      </button>
    </div>
  );
}
