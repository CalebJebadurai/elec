import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { api } from '../api';
import type { StateInfo } from '../types';

type ElectionType = 'AE' | 'GE';

interface StateContextValue {
  states: StateInfo[];
  selectedState: string;
  selectState: (stateName: string) => void;
  electionType: ElectionType;
  setElectionType: (type: ElectionType) => void;
  loading: boolean;
}

const StateContext = createContext<StateContextValue | undefined>(undefined);

const DEFAULT_STATE = 'Tamil_Nadu';

export function StateProvider({ children }: { children: ReactNode }) {
  const [states, setStates] = useState<StateInfo[]>([]);
  const [selectedState, setSelectedState] = useState(
    () => localStorage.getItem('selected_state') || DEFAULT_STATE
  );
  const [electionType, setElectionType] = useState<ElectionType>('AE');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .states()
      .then((data) => {
        setStates(data);
        if (data.length && !data.find((s) => s.state_name === selectedState)) {
          setSelectedState(data[0].state_name);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Reset to AE when state changes (new state may not have GE data)
  useEffect(() => {
    setElectionType('AE');
  }, [selectedState]);

  function selectState(stateName: string) {
    setSelectedState(stateName);
    localStorage.setItem('selected_state', stateName);
  }

  return (
    <StateContext.Provider
      value={{
        states,
        selectedState,
        selectState,
        electionType,
        setElectionType,
        loading,
      }}
    >
      {children}
    </StateContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStateSelection(): StateContextValue {
  const ctx = useContext(StateContext);
  if (!ctx) throw new Error('useStateSelection must be inside StateProvider');
  return ctx;
}
