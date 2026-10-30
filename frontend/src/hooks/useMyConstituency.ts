import { useState, useCallback } from 'react';

export interface MyConstituency {
  state: string;
  electionType: string;
  name: string;
}

const KEY = 'my_constituency';

function read(): MyConstituency | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as MyConstituency) : null;
  } catch {
    return null;
  }
}

/** The constituency the visitor has pinned as theirs, kept only in this browser. */
export function useMyConstituency() {
  const [mine, setMine] = useState<MyConstituency | null>(read);

  const save = useCallback((value: MyConstituency | null) => {
    try {
      if (value) localStorage.setItem(KEY, JSON.stringify(value));
      else localStorage.removeItem(KEY);
    } catch {
      // Storage may be unavailable (private mode); keep the in-memory value
    }
    setMine(value);
  }, []);

  return [mine, save] as const;
}
