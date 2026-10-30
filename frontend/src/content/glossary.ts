export interface GlossaryEntry {
  /** Stable id, also used as the URL anchor (/glossary#enop) */
  id: string;
  term: string;
  /** One or two plain sentences, no jargon */
  short: string;
  /** Optional longer explanation or example */
  more?: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    id: 'fptp',
    term: 'First past the post',
    short:
      'The candidate with the most votes in a constituency wins the seat, even without a majority of votes.',
    more: 'India uses this system for Lok Sabha and Assembly elections. A party can win many seats with a modest vote share if its votes are spread well, which is why seat counts and vote shares often look different.',
  },
  {
    id: 'constituency',
    term: 'Constituency',
    short:
      'An area whose voters elect one representative: an MLA for an Assembly, an MP for the Lok Sabha.',
  },
  {
    id: 'reserved',
    term: 'Reserved constituency (SC / ST)',
    short:
      'A seat where only candidates from Scheduled Castes (SC) or Scheduled Tribes (ST) may stand. Everyone in the area can still vote.',
    more: 'Seats without a reservation are marked GEN (general).',
  },
  {
    id: 'electors',
    term: 'Electors',
    short: 'People on the electoral roll, that is, everyone registered and eligible to vote.',
  },
  {
    id: 'turnout',
    term: 'Turnout',
    short: 'The share of electors who actually voted.',
    more: 'If 1,00,000 people are registered and 70,000 vote, turnout is 70%.',
  },
  {
    id: 'vote-share',
    term: 'Vote share',
    short: 'The percentage of valid votes a candidate or party received.',
  },
  {
    id: 'margin',
    term: 'Margin (victory margin)',
    short:
      'How many more votes the winner got than the runner-up. Shown as a number of votes or as a percentage of votes cast.',
    more: 'Small margins (under about 2–5%) mark close seats that could flip with a small change in votes.',
  },
  {
    id: 'swing',
    term: 'Swing',
    short:
      "The change in a party's vote share from one election to the next, in percentage points.",
    more: 'If a party got 35% last time and 40% this time, it gained a +5 point swing. Uniform swing assumes the same change happens in every seat; proportional swing scales it to how strong the party already was.',
  },
  {
    id: 'anti-incumbency',
    term: 'Anti-incumbency',
    short: 'The tendency of voters to turn against the party or member currently in power.',
    more: 'In the simulator this slider moves a share of the incumbent’s votes to its opponents. It is an assumption you choose, not a measured fact.',
  },
  {
    id: 'incumbent',
    term: 'Incumbent',
    short: 'The sitting member, or the party that won the seat last time.',
  },
  {
    id: 'enop',
    term: 'ENOP (effective number of parties)',
    short:
      'A single number for how fragmented the vote was. 2 means a two-way fight; higher numbers mean votes split among more parties.',
    more: 'Calculated as 1 ÷ (sum of each party’s vote share squared), using shares as fractions. Two parties at 50% each give ENOP = 2.',
  },
  {
    id: 'majority-mark',
    term: 'Majority mark',
    short:
      'The number of seats needed to form a government on its own: more than half of all seats.',
  },
  {
    id: 'hung-assembly',
    term: 'Hung Assembly',
    short: 'When no party or pre-poll alliance reaches the majority mark.',
  },
  {
    id: 'turncoat',
    term: 'Turncoat',
    short: 'A candidate who contested for a different party than in the previous election.',
  },
  {
    id: 'recontest',
    term: 'Recontest',
    short: 'A candidate standing again after contesting an earlier election.',
  },
  {
    id: 'nota',
    term: 'NOTA',
    short:
      '“None of the above”: a button on the voting machine to reject every candidate. NOTA votes are counted but cannot win the seat.',
  },
  {
    id: 'delimitation',
    term: 'Delimitation',
    short:
      'Redrawing constituency boundaries. The last nationwide redrawing took effect from 2008, so some seats before and after are not directly comparable.',
  },
  {
    id: 'bye-election',
    term: 'Bye-election',
    short:
      'A single-seat election held when a seat falls vacant between general elections. This site focuses on general elections.',
  },
  {
    id: 'simulation',
    term: 'Simulation (on this site)',
    short:
      'A what-if result produced by applying your chosen slider values to past results. It is not a forecast of what will happen.',
  },
];

export function findGlossaryEntry(id: string): GlossaryEntry | undefined {
  return GLOSSARY.find((g) => g.id === id);
}
