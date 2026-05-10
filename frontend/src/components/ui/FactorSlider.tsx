import React from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Slider } from './slider';

interface FactorSliderProps {
  factorName: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  label: string;
  tooltip: string;
  onValueChange: (v: number) => void;
  onReset: () => void;
}

export const FactorSlider = React.memo(function FactorSlider({
  value,
  defaultValue,
  min,
  max,
  step,
  label,
  tooltip,
  onValueChange,
  onReset,
}: FactorSliderProps) {
  const isDefault = value === defaultValue;
  const defaultPosition = ((defaultValue - min) / (max - min)) * 100;

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between text-sm text-neutral-300 mb-1">
        <Tooltip.Provider delayDuration={300}>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <span className="cursor-help border-b border-dotted border-neutral-600">{label}</span>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="max-w-xs rounded-lg bg-neutral-800 px-3 py-2 text-xs text-neutral-200 shadow-lg border border-neutral-700"
                sideOffset={5}
              >
                {tooltip}
                <Tooltip.Arrow className="fill-neutral-800" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-primary-400">{value}</span>
          {!isDefault && (
            <button
              onClick={onReset}
              className="text-xs text-neutral-500 hover:text-primary-400 transition-colors"
              aria-label={`Reset ${label} to default`}
            >
              ↺
            </button>
          )}
        </div>
      </div>
      <div className="relative">
        <Slider
          value={value}
          onValueChange={onValueChange}
          min={min}
          max={max}
          step={step}
          aria-label={label}
        />
        {/* Default value marker */}
        {defaultPosition > 0 && defaultPosition < 100 && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-neutral-500 pointer-events-none"
            style={{ left: `${defaultPosition}%` }}
          />
        )}
      </div>
      <div className="flex justify-between text-xs text-neutral-500 mt-0.5">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
});
