import factorCatalogData from './data/factor_catalog.json';
import coefficientsData from './data/coefficients.json';
import allianceData from './data/alliance_data.json';

// ── Factor Catalog Types ────────────────────────────────

export type FactorCategory =
  | 'turnout_mobilization'
  | 'incumbency_dynamics'
  | 'electoral_competition'
  | 'geographic_structural'
  | 'party_strength';

export type FactorLevel = 'candidate' | 'constituency' | 'state';
export type SliderType = 'impact' | 'value' | 'state';

export interface FactorCatalogEntry {
  name: string;
  displayName: string;
  category: FactorCategory;
  level: FactorLevel;
  sliderType: SliderType;
  range: { min: number; max: number };
  step: number;
  defaultValue: number;
  defaultType: 'constituency_actual' | 'state_average' | 'coefficient';
  direction: 'positive' | 'negative' | 'bidirectional';
  tooltip: string;
}

export interface AllianceBlocData {
  name: string;
  parties: string[];
  transferEfficiency: number;
}

// ── Exported constants ──────────────────────────────────

export const FACTOR_CATALOG: FactorCatalogEntry[] = factorCatalogData as FactorCatalogEntry[];

export const COEFFICIENTS: Record<string, Record<string, number>> = coefficientsData as Record<
  string,
  Record<string, number>
>;

export const ALLIANCE_DATA: Record<
  string,
  Record<string, AllianceBlocData[]>
> = allianceData as Record<string, Record<string, AllianceBlocData[]>>;

// ── Category display info ───────────────────────────────

export const FACTOR_CATEGORIES: Record<FactorCategory, { label: string; description: string }> = {
  turnout_mobilization: {
    label: 'Turnout & Mobilization',
    description: 'Voter participation and turnout dynamics',
  },
  incumbency_dynamics: {
    label: 'Incumbency Dynamics',
    description: 'Incumbent, turncoat, and recontest effects',
  },
  electoral_competition: {
    label: 'Electoral Competition',
    description: 'Margin, party fragmentation, and candidate count effects',
  },
  geographic_structural: {
    label: 'Geographic & Structural',
    description: 'Reserved constituency and demographic effects',
  },
  party_strength: {
    label: 'Party Strength',
    description: 'Historical party performance effects',
  },
};

// ── Helpers ─────────────────────────────────────────────

export function getFactorsByCategory(category: FactorCategory): FactorCatalogEntry[] {
  return FACTOR_CATALOG.filter((f) => f.category === category);
}

export function getCoefficients(stateName: string | null): Record<string, number> {
  if (stateName && COEFFICIENTS[stateName]) return COEFFICIENTS[stateName];
  return COEFFICIENTS['_national'];
}

export function getAlliancePresets(
  stateName: string | null
): Record<string, AllianceBlocData[]> | null {
  if (stateName && ALLIANCE_DATA[stateName]) return ALLIANCE_DATA[stateName];
  return null;
}
