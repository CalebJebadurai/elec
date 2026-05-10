import type { AffinityPresets, AppPredictionParams } from './types';

export const PARTY_COLORS: Record<string, string> = {
  // National parties
  BJP: '#ff9933',
  INC: '#19aaed',
  'INC(I)': '#19aaed',
  BSP: '#7777ff',
  SP: '#ff4444',
  CPM: '#ff4444',
  CPI: '#ff4444',
  NCP: '#00bfff',
  AITC: '#20b050',
  AAP: '#3399ff',

  // North India regional
  JD: '#33b366',
  'JD(U)': '#33b366',
  'JD(S)': '#33cc33',
  RJD: '#00cc00',
  LJP: '#5599ff',
  JNP: '#5bb88a',
  SAD: '#ff6600',
  INLD: '#55bb55',
  JMM: '#33aa33',
  RLD: '#88aa55',

  // South India regional
  DMK: '#ff4747',
  ADMK: '#00a651',
  ADK: '#00a651',
  'ADK(JL)': '#4db87e',
  TDP: '#ffcc00',
  YSRCP: '#3388ff',
  BJD: '#339933',
  PMK: '#ffd700',
  MDMK: '#f05050',
  DMDK: '#33bbbb',
  VCK: '#d966d9',
  NTK: '#ffa500',
  IUML: '#33aa33',
  PT: '#4169e1',

  // East & West regional
  SHS: '#ff6600',
  AGP: '#ff9900',
  MNF: '#0077b6',
  NPF: '#b5651d',
  SKM: '#d4a373',
  TRS: '#ff1493',
  BRS: '#ff1493',
  NDPP: '#cc8855',

  // Historical national
  BJS: '#cc6600',
  SWA: '#5f9ea0',
  NCO: '#6688aa',
  BLD: '#bbbb33',
  DDP: '#9370db',
  PSP: '#d2691e',
  SSP: '#8fbc8f',

  // Common
  IND: '#888888',
  NOTA: '#999999',
};

function _hashColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 55%, 45%)`;
}

export function partyColor(party: string | null | undefined): string {
  const key = party ?? '';
  return PARTY_COLORS[key] || PARTY_COLORS[normalizeParty(party)] || _hashColor(party || 'IND');
}

export function normalizeParty(p: string | null | undefined): string {
  if (!p) return 'IND';
  const u = p.trim();

  // INC variants
  if (u === 'INC(I)') return 'INC';

  // ADMK variants
  if (u === 'ADK' || u === 'ADK(JL)' || u === 'AADMK') return 'ADMK';

  // SP variants
  if (u === 'S.P' || u === 'S.P.') return 'SP';

  // JD variants
  if (u === 'JD (S)') return 'JD(S)';
  if (u === 'JD (U)') return 'JD(U)';

  // BSP variants
  if (u === 'BSP(K)' || u === 'BSP (K)') return 'BSP';

  // SHS variants (Shiv Sena)
  if (u === 'SS' || u === 'ShivSena') return 'SHS';

  // TMC / AITC (Trinamool Congress)
  if (u === 'TMC' || u === 'AITMC') return 'AITC';

  // NCP variants
  if (u === 'NCP(SP)' || u === 'NCP-SP') return 'NCP';

  // TRS → BRS (Telangana Rashtra Samithi renamed to Bharat Rashtra Samithi)
  if (u === 'TRS') return 'BRS';

  return u;
}

// Majority mark computed from constituency count
export function majorityMark(totalConstituencies: number): number {
  return Math.floor(totalConstituencies / 2) + 1;
}

export const MAJOR_PARTIES: string[] = []; // populated dynamically from API data

export const AFFINITY_PRESETS: AffinityPresets = {
  'ruling-leaning': {
    label: 'Ruling Party-leaning Disruptor',
    weights: { Others: 0.2 },
  },
  'opposition-leaning': {
    label: 'Opposition-leaning Disruptor',
    weights: { Others: 0.2 },
  },
  neutral: {
    label: 'Neutral Disruptor',
    weights: { Others: 0.2 },
  },
  custom: {
    label: 'Custom (edit all weights)',
    weights: { Others: 0.2 },
  },
};

export const DEFAULT_PREDICTION_PARAMS: AppPredictionParams = {
  antiIncumbencyPct: 10,
  totalElectors: null,
  turnoutPct: 75,
  newPartyName: '',
  newPartyColor: '#9b59b6',
  newPartyPreset: 'neutral',
  newPartyStatewideVoteShare: 0,
  affinityWeights: { ...AFFINITY_PRESETS['neutral'].weights },
  constituencyOverrides: {},

  // Multi-factor defaults (0 = no adjustment from baseline)
  turnoutChange: 0,
  incumbencyFatigue: 0,
  turncoatPenalty: 0,
  recontestBonus: 0,
  sameConstituencyBonus: 0,
  previousMarginFactor: 0,
  enopFactor: 0,
  nCandFactor: 0,
  constituencyTypeFactor: 0,
  genderFactor: 0,
  partyStrengthFactor: 0,
  partyVoteShareFactor: 0,

  allianceConfig: [],
  predictionMode: 'formula',
};

/**
 * Build dynamic affinity presets from the actual top parties in the dataset.
 * Called once after prediction data is loaded.
 */
export function buildAffinityPresets(topParties: string[]): AffinityPresets {
  if (!topParties || topParties.length < 2) return AFFINITY_PRESETS;

  const [first, second] = topParties;
  const othersWeight = 0.05;
  const buildWeights = (
    primary: string,
    primaryW: number,
    secondaryW: number
  ): Record<string, number> => {
    const w: Record<string, number> = {};
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
      weights: buildWeights(first, 0.4, 0.3),
    },
    'opposition-leaning': {
      label: 'Opposition-leaning Disruptor',
      weights: buildWeights(second, 0.4, 0.3),
    },
    neutral: {
      label: 'Neutral Disruptor',
      weights: (() => {
        const w: Record<string, number> = {};
        topParties.forEach((p) => {
          w[p] = +(1 / (topParties.length + 1)).toFixed(2);
        });
        w['Others'] = +(1 / (topParties.length + 1)).toFixed(2);
        return w;
      })(),
    },
    custom: {
      label: 'Custom (edit all weights)',
      weights: (() => {
        const w: Record<string, number> = {};
        topParties.forEach((p) => {
          w[p] = +(1 / (topParties.length + 1)).toFixed(2);
        });
        w['Others'] = +(1 / (topParties.length + 1)).toFixed(2);
        return w;
      })(),
    },
  };
}

// ── GeoJSON ↔ DB state name mapping ──────────────────────────────────
// GeoJSON properties.NAME_1 → DB state_name
export const GEO_TO_DB: Record<string, string> = {
  'Andaman & Nicobar': 'Andaman_&_Nicobar_Islands',
  'Andhra Pradesh': 'Andhra_Pradesh',
  'Arunachal Pradesh': 'Arunachal_Pradesh',
  Assam: 'Assam',
  Bihar: 'Bihar',
  Chandigarh: 'Chandigarh',
  Chhattisgarh: 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu': 'Dadra_&_Nagar_Haveli',
  Delhi: 'Delhi',
  Goa: 'Goa',
  Gujarat: 'Gujarat',
  Haryana: 'Haryana',
  'Himachal Pradesh': 'Himachal_Pradesh',
  'Jammu & Kashmir': 'Jammu_&_Kashmir',
  Jharkhand: 'Jharkhand',
  Karnataka: 'Karnataka',
  Kerala: 'Kerala',
  Ladakh: 'Ladakh',
  Lakshadweep: 'Lakshadweep',
  'Madhya Pradesh': 'Madhya_Pradesh',
  Maharashtra: 'Maharashtra',
  Manipur: 'Manipur',
  Meghalaya: 'Meghalaya',
  Mizoram: 'Mizoram',
  Nagaland: 'Nagaland',
  Odisha: 'Odisha',
  Puducherry: 'Puducherry',
  Punjab: 'Punjab',
  Rajasthan: 'Rajasthan',
  Sikkim: 'Sikkim',
  'Tamil Nadu': 'Tamil_Nadu',
  Telangana: 'Telangana',
  Tripura: 'Tripura',
  'Uttar Pradesh': 'Uttar_Pradesh',
  Uttarakhand: 'Uttarakhand',
  'West Bengal': 'West_Bengal',
};

// Reverse: DB state_name → GeoJSON NAME_1
export const DB_TO_GEO: Record<string, string> = Object.fromEntries(
  Object.entries(GEO_TO_DB).map(([geo, db]) => [db, geo])
);
