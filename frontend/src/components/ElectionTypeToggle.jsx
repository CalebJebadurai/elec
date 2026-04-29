import { useStateSelection } from '../contexts/StateContext';

export default function ElectionTypeToggle() {
  const { states, selectedState, electionType, setElectionType } = useStateSelection();

  const stateInfo = states.find((s) => s.state_name === selectedState);
  const hasGE = stateInfo && stateInfo.ge_constituencies > 0;

  return (
    <div className="flex gap-1">
      <button
        className={`px-3 py-1.5 text-xs rounded-md border transition-colors cursor-pointer ${electionType === 'AE' ? 'bg-primary-400 text-black border-primary-400' : 'bg-neutral-900 text-neutral-300 border-neutral-700 hover:bg-neutral-800'}`}
        onClick={() => setElectionType('AE')}
      >
        Assembly
      </button>
      <button
        className={`px-3 py-1.5 text-xs rounded-md border transition-colors cursor-pointer ${electionType === 'GE' ? 'bg-primary-400 text-black border-primary-400' : 'bg-neutral-900 text-neutral-300 border-neutral-700 hover:bg-neutral-800'}`}
        onClick={() => setElectionType('GE')}
        disabled={!hasGE}
        title={hasGE ? 'Lok Sabha Elections' : 'No Lok Sabha data for this state'}
      >
        Lok Sabha
      </button>
    </div>
  );
}
