import { useStateSelection } from '../contexts/StateContext';

export default function ElectionTypeToggle() {
  const { states, selectedState, electionType, setElectionType } = useStateSelection();

  const stateInfo = states.find((s) => s.state_name === selectedState);
  const hasGE = stateInfo && stateInfo.ge_constituencies > 0;

  return (
    <div className="election-type-toggle">
      <button
        className={`toggle-btn ${electionType === 'AE' ? 'toggle-btn--active' : ''}`}
        onClick={() => setElectionType('AE')}
      >
        Assembly
      </button>
      <button
        className={`toggle-btn ${electionType === 'GE' ? 'toggle-btn--active' : ''}`}
        onClick={() => setElectionType('GE')}
        disabled={!hasGE}
        title={hasGE ? 'Lok Sabha Elections' : 'No Lok Sabha data for this state'}
      >
        Lok Sabha
      </button>
    </div>
  );
}
