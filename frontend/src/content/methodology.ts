/** Version of the client-side scenario formula documented on /methodology. */
export const METHOD_VERSION = '1.1';

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

/** Newest first. Add an entry whenever predictionEngine.ts or its coefficients change. */
export const METHOD_CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.1',
    date: '2026-10-30',
    changes: [
      'Methodology page published; no change to the formula.',
      'All simulator output labelled “Simulation, not a forecast”.',
    ],
  },
  {
    version: '1.0',
    date: '2026-05-11',
    changes: [
      'Added twelve factor sliders with per-state coefficients, alliance vote transfers and seat ranges.',
    ],
  },
  {
    version: '0.1',
    date: '2026-04-19',
    changes: ['First release: anti-incumbency, turnout and new-party sliders.'],
  },
];
