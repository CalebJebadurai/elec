export const SIMULATION_LABEL = 'Simulation, not a forecast';

interface Props {
  className?: string;
}

/**
 * Persistent, non-dismissible stamp for any output produced by the scenario
 * simulator. Unlike the Disclaimer banner it cannot be hidden.
 */
export default function SimulationBadge({ className = '' }: Props) {
  return (
    <span
      role="note"
      title="Generated from user-chosen sliders applied to past results. It does not predict what will happen."
      className={`inline-flex items-center gap-1 bg-warning/15 text-warning border border-warning/40 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap ${className}`}
    >
      <span aria-hidden="true">⚠</span>
      {SIMULATION_LABEL}
    </span>
  );
}
