// Election-pair dataset for the swing model: every general assembly election in the local
// TCPD dump, paired with the next one in the same state under the same boundaries.
// Only information known on the day before the target election goes into the features.
import { existsSync } from 'node:fs';
import { readCsv, num, type Row } from '../backtest/csv';
import { normalizeParty } from '../../frontend/src/constants';

export interface SeatResult {
  no: number;
  name: string;
  type: string; // GEN / SC / ST
  electors: number;
  turnout: number;
  shares: Record<string, number>; // party -> vote share %, independents pooled as IND
  winner: string;
  runnerUp: string;
  margin: number;
  winnerTerms: number; // No_Terms of the sitting MLA after this election
}

export interface StateElection {
  state: string;
  year: number;
  month: number;
  delim: string;
  seats: Map<number, SeatResult>;
  stateShare: Record<string, number>; // party -> state-wide vote share %
  seatsWon: Record<string, number>;
  largest: string;
  turnout: number;
  electors: number;
}

const AE_PATH = new URL('../../data/TCPD_AE_All_States_2026-4-30.csv.gz', import.meta.url).pathname;
const GE_PATH = new URL('../../data/TCPD_GE_All_States_2026-4-30.csv.gz', import.meta.url).pathname;

/** General elections per state: Poll_No 0, covering at least 40% of the state's largest house. */
export function buildElections(rows: Row[]): StateElection[] {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    if (r.Poll_No !== '0') continue;
    const k = `${r.State_Name}|${r.Year}`;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(r);
  }
  const all: StateElection[] = [];
  for (const [k, g] of groups) {
    const [state, year] = k.split('|');
    const seats = new Map<number, SeatResult>();
    const byNo = new Map<number, Row[]>();
    for (const r of g) {
      const no = num(r.Constituency_No);
      let s = byNo.get(no);
      if (!s) byNo.set(no, (s = []));
      s.push(r);
    }
    const partyVotes: Record<string, number> = {};
    const seatsWon: Record<string, number> = {};
    let valid = 0;
    let electors = 0;
    let voters = 0;
    const delims = new Map<string, number>();
    for (const [no, cs] of byNo) {
      cs.sort((a, b) => num(a.Position) - num(b.Position));
      const w = cs[0];
      if (num(w.Position) !== 1) continue;
      const shares: Record<string, number> = {};
      for (const c of cs) {
        const p = normalizeParty(c.Party);
        shares[p] = (shares[p] || 0) + (num(c.Vote_Share_Percentage) || 0);
        partyVotes[p] = (partyVotes[p] || 0) + (num(c.Votes) || 0);
      }
      const v = num(w.Valid_Votes) || 0;
      const e = num(w.Electors) || 0;
      valid += v;
      electors += e;
      voters += (e * (num(w.Turnout_Percentage) || 0)) / 100;
      delims.set(w.DelimID, (delims.get(w.DelimID) || 0) + 1);
      const winner = normalizeParty(w.Party);
      seatsWon[winner] = (seatsWon[winner] || 0) + 1;
      seats.set(no, {
        no,
        name: w.Constituency_Name,
        type: w.Constituency_Type,
        electors: e,
        turnout: num(w.Turnout_Percentage) || 0,
        shares,
        winner,
        runnerUp: cs[1] ? normalizeParty(cs[1].Party) : '',
        margin: num(w.Margin_Percentage) || 0,
        winnerTerms: num(w.No_Terms) || 1,
      });
    }
    const stateShare: Record<string, number> = {};
    for (const [p, v] of Object.entries(partyVotes)) stateShare[p] = valid ? (100 * v) / valid : 0;
    const largest = Object.entries(seatsWon).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    all.push({
      state,
      year: Number(year),
      month: num(g[0].month) || 0,
      delim: [...delims.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '',
      seats,
      stateShare,
      seatsWon,
      largest,
      turnout: electors ? (100 * voters) / electors : 0,
      electors,
    });
  }
  // Drop partial polls (as the API's _get_general_years does)
  const maxSeats: Record<string, number> = {};
  for (const e of all) maxSeats[e.state] = Math.max(maxSeats[e.state] || 0, e.seats.size);
  return all
    .filter((e) => e.seats.size >= 0.4 * maxSeats[e.state])
    .sort((a, b) => a.state.localeCompare(b.state) || a.year - b.year);
}

export interface LokSabha {
  shares: Record<string, Record<number, Record<string, number>>>; // state -> year -> party -> %
  month: Record<number, number>; // year -> month of polling (first row seen)
}

/** State-wide Lok Sabha party shares. */
export function buildLokSabha(rows: Row[]): LokSabha {
  const month: Record<number, number> = {};
  const votes: Record<string, Record<number, Record<string, number>>> = {};
  const valid: Record<string, Record<number, number>> = {};
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.Poll_No !== '0') continue;
    const st = r.State_Name;
    const y = num(r.Year);
    month[y] ??= num(r.month) || 0;
    const p = normalizeParty(r.Party);
    ((votes[st] ??= {})[y] ??= {})[p] = (votes[st][y][p] || 0) + (num(r.Votes) || 0);
    const k = `${st}|${y}|${r.Constituency_No}`;
    if (!seen.has(k)) {
      seen.add(k);
      (valid[st] ??= {})[y] = (valid[st][y] || 0) + (num(r.Valid_Votes) || 0);
    }
  }
  const out: Record<string, Record<number, Record<string, number>>> = {};
  for (const st of Object.keys(votes))
    for (const y of Object.keys(votes[st]).map(Number)) {
      const v = valid[st][y];
      if (!v) continue;
      out[st] ??= {};
      out[st][y] = Object.fromEntries(Object.entries(votes[st][y]).map(([p, n]) => [p, (100 * n) / v]));
    }
  return { shares: out, month };
}

/** Latest Lok Sabha result in the state held after `base` and before `target`. */
export function lokSabhaBetween(ls: LokSabha, state: string, base: StateElection, target: { year: number; month: number }) {
  const after = (y: number, m: number, ref: { year: number; month: number }) => y > ref.year || (y === ref.year && m > ref.month);
  const years = Object.keys(ls.shares[state] || {})
    .map(Number)
    .filter((y) => after(y, ls.month[y], base) && after(target.year, target.month, { year: y, month: ls.month[y] }));
  return years.length ? ls.shares[state][Math.max(...years)] : null;
}

export interface Pair {
  base: StateElection;
  prior: StateElection | null; // election before base, for the trend
  target: StateElection;
  sameBoundaries: boolean;
}

export function buildPairs(elections: StateElection[]): Pair[] {
  const pairs: Pair[] = [];
  for (let i = 1; i < elections.length; i++) {
    const [b, t] = [elections[i - 1], elections[i]];
    if (b.state !== t.state) continue;
    const prior = i >= 2 && elections[i - 2].state === b.state ? elections[i - 2] : null;
    pairs.push({ base: b, prior, target: t, sameBoundaries: b.delim === t.delim });
  }
  return pairs;
}

// Newer results converted from ECI statistical reports (datascience/refresh); used when present
const AE_NEW = new URL('../refresh/raw/ae_2023_26_tcpd.csv', import.meta.url).pathname;
const GE_NEW = new URL('../refresh/raw/ge_2024_tcpd.csv', import.meta.url).pathname;

/** TCPD rows plus newer ECI rows for state-years TCPD does not have. */
function withNew(base: Row[], path: string): Row[] {
  if (!existsSync(path)) return base;
  const have = new Set(base.map((r) => `${r.State_Name}|${r.Year}`));
  return [...base, ...readCsv(path).filter((r) => !have.has(`${r.State_Name}|${r.Year}`))];
}

let cache: { elections: StateElection[]; ls: LokSabha } | null = null;
/**
 * Load elections. `untilYear` drops everything after it (so a test can see the world as it
 * was), and NO_NEW_DATA=1 ignores the ECI supplement (TCPD dump only).
 */
export function load(untilYear = Infinity) {
  if (!cache) {
    const useNew = process.env.NO_NEW_DATA !== '1';
    const ae = useNew ? withNew(readCsv(AE_PATH), AE_NEW) : readCsv(AE_PATH);
    const ge = useNew && process.env.NO_LS2024 !== '1' ? withNew(readCsv(GE_PATH), GE_NEW) : readCsv(GE_PATH);
    cache = { elections: buildElections(ae), ls: buildLokSabha(ge) };
  }
  if (untilYear === Infinity) return cache;
  return {
    elections: cache.elections.filter((e) => e.year <= untilYear),
    ls: { ...cache.ls, shares: Object.fromEntries(Object.entries(cache.ls.shares).map(([st, ys]) => [st, Object.fromEntries(Object.entries(ys).filter(([y]) => Number(y) <= untilYear))])) },
  };
}
