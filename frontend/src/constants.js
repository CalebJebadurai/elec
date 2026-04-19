export const PARTY_COLORS = {
  DMK: '#e30613',
  ADMK: '#00a651',
  ADK: '#00a651',
  'ADK(JL)': '#4db87e',
  INC: '#19aaed',
  'INC(I)': '#19aaed',
  BJP: '#ff9933',
  PMK: '#ffd700',
  MDMK: '#8b0000',
  DMDK: '#008080',
  VCK: '#800080',
  CPM: '#cc0000',
  CPI: '#ff4444',
  NTK: '#ffa500',
  IUML: '#006400',
  IND: '#888888',
  JNP: '#2e8b57',
  PT: '#4169e1',
};

export function partyColor(party) {
  return PARTY_COLORS[party] || '#999999';
}

export const GENERAL_YEARS = [1971, 1977, 1980, 1984, 1989, 1991, 1996, 2001, 2006, 2011, 2016, 2021];

export function normalizeParty(p) {
  if (!p) return 'IND';
  if (p === 'ADK' || p === 'ADK(JL)' || p === 'AADMK') return 'ADMK';
  if (p === 'INC(I)') return 'INC';
  return p;
}

// Majority mark computed from constituency count
export function majorityMark(totalConstituencies) {
  return Math.floor(totalConstituencies / 2) + 1;
}

export const MAJOR_PARTIES = []; // populated dynamically from API data

export const AFFINITY_PRESETS = {
  'ruling-leaning': {
    label: 'Ruling Party-leaning Disruptor',
    weights: { Others: 0.20 },
  },
  'opposition-leaning': {
    label: 'Opposition-leaning Disruptor',
    weights: { Others: 0.20 },
  },
  'neutral': {
    label: 'Neutral Disruptor',
    weights: { Others: 0.20 },
  },
  'custom': {
    label: 'Custom (edit all weights)',
    weights: { Others: 0.20 },
  },
};

export const DEFAULT_PREDICTION_PARAMS = {
  antiIncumbencyPct: 10,
  turnoutPct: 75,
  newPartyName: '',
  newPartyColor: '#9b59b6',
  newPartyPreset: 'neutral',
  newPartyStatewideVoteShare: 0,
  affinityWeights: { ...AFFINITY_PRESETS['neutral'].weights },
  constituencyOverrides: {},
};

/**
 * Build dynamic affinity presets from the actual top parties in the dataset.
 * Called once after prediction data is loaded.
 */
export function buildAffinityPresets(topParties) {
  if (!topParties || topParties.length < 2) return AFFINITY_PRESETS;

  const [first, second, ...rest] = topParties;
  const othersWeight = 0.05;
  const buildWeights = (primary, primaryW, secondaryW) => {
    const w = {};
    w[primary] = primaryW;
    const remaining = topParties.filter((p) => p !== primary);
    remaining.forEach((p) => {
      w[p] = p === (primary === first ? second : first) ? secondaryW : othersWeight;
    });
    w['Others'] = othersWeight;
    return w;
  };

  return {
    'ruling-leaning': {
      label: 'Leading party-leaning Disruptor',
      weights: buildWeights(first, 0.40, 0.30),
    },
    'opposition-leaning': {
      label: 'Opposition-leaning Disruptor',
      weights: buildWeights(second, 0.40, 0.30),
    },
    'neutral': {
      label: 'Neutral Disruptor',
      weights: (() => {
        const w = {};
        topParties.forEach((p) => { w[p] = +(1 / (topParties.length + 1)).toFixed(2); });
        w['Others'] = +(1 / (topParties.length + 1)).toFixed(2);
        return w;
      })(),
    },
    'custom': {
      label: 'Custom (edit all weights)',
      weights: (() => {
        const w = {};
        topParties.forEach((p) => { w[p] = +(1 / (topParties.length + 1)).toFixed(2); });
        w['Others'] = +(1 / (topParties.length + 1)).toFixed(2);
        return w;
      })(),
    },
  };
}
