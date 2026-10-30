/** Version of the client-side scenario formula documented on /methodology. */
export const METHOD_VERSION = '2.2';

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

/** Newest first. Add an entry whenever predictionEngine.ts or its coefficients change. */
export const METHOD_CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.2',
    date: '2026-10-30',
    changes: [
      'Tested recency weighting and the chief minister’s party as the incumbent; neither helped, so the model design is unchanged.',
      'Added a new-party warning based on how often new parties have mattered since 2000.',
      'Women’s turnout tested against results on 384 Lok Sabha and 1,980 assembly seats: no reliable link, so no gender term. The women voter group now uses each state’s real share of voters.',
      'Party labels cleaned up for TCPD’s 2022–23 full-name entries. Backtest 2000–2026: 50.6% of seats right.',
    ],
  },
  {
    version: '2.1',
    date: '2026-10-30',
    changes: [
      'Data refreshed: 19 assembly elections from 2023–26 and the 2024 Lok Sabha, from ECI statistical reports. Forecasts now start from each state’s latest election.',
      'Model refitted on 251 election pairs (same design). Backtest 2000–2026: 50.5% of seats right vs 44.8% for “same party wins again”.',
    ],
  },
  {
    version: '2.0',
    date: '2026-10-30',
    changes: [
      'New default: a learned swing model (engine/swingModel.ts) fitted on 234 pairs of assembly elections, with simulated seat ranges and win chances.',
      'Backtested: 49.4% of seats right on 2000–2023 elections (persistence 44.3%, old formula 43.7%); 58.4% on the 2023–26 elections in a pre-registered test (persistence 51.2%).',
      'New sliders in points of vote share: anti-incumbency, party swings, sitting MLA, turnout, new voters and voter groups.',
      'Prediction data fixes: seats sharing a name are no longer merged, and by-elections are excluded.',
      'The previous formula remains available as “Classic formula”.',
    ],
  },
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
