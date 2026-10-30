import { useStateSelection } from '../contexts/StateContext';

export default function ElectionTypeToggle() {
  const { states, selectedState, electionType, setElectionType } = useStateSelection();

  const stateInfo = states.find((s) => s.state_name === selectedState);
  const hasGE = stateInfo && stateInfo.ge_constituencies > 0;

  return (
    <div
      className="inline-flex p-1 rounded-full bg-neutral-900/80 border border-neutral-800"
      role="group"
      aria-label="Election type"
    >
      <button
        aria-pressed={electionType === 'AE'}
        className={`px-3.5 h-7 text-xs rounded-full transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${electionType === 'AE' ? 'bg-primary-400 text-black font-semibold' : 'text-neutral-300 hover:text-white'}`}
        onClick={() => setElectionType('AE')}
      >
        Assembly
      </button>
      <button
        aria-pressed={electionType === 'GE'}
        className={`px-3.5 h-7 text-xs rounded-full transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${electionType === 'GE' ? 'bg-primary-400 text-black font-semibold' : 'text-neutral-300 hover:text-white'}`}
        onClick={() => setElectionType('GE')}
        disabled={!hasGE}
        title={hasGE ? 'Lok Sabha Elections' : 'No Lok Sabha data for this state'}
      >
        Lok Sabha
      </button>
    </div>
  );
}
