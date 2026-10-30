export type Party = 'A' | 'B' | 'C';

export interface ToySeat {
  name: string;
  /** Vote shares in percent; they sum to 100 */
  shares: Record<Party, number>;
}

/** Five made-up seats used by the lessons. Party A is spread thin, B is concentrated. */
export const TOY_SEATS: ToySeat[] = [
  { name: 'Riverside', shares: { A: 36, B: 34, C: 30 } },
  { name: 'Hilltop', shares: { A: 38, B: 37, C: 25 } },
  { name: 'Market Town', shares: { A: 33, B: 40, C: 27 } },
  { name: 'Lakeview', shares: { A: 30, B: 55, C: 15 } },
  { name: 'Old Fort', shares: { A: 35, B: 31, C: 34 } },
];

export const PARTIES: Party[] = ['A', 'B', 'C'];

export function winner(shares: Record<Party, number>): Party {
  return PARTIES.reduce((best, p) => (shares[p] > shares[best] ? p : best), PARTIES[0]);
}

/** Move `swing` points from B to A in every seat (uniform swing), clamped to 0–100. */
export function applySwing(seat: ToySeat, swing: number): ToySeat {
  const moved = Math.max(-seat.shares.A, Math.min(seat.shares.B, swing));
  return {
    ...seat,
    shares: { A: seat.shares.A + moved, B: seat.shares.B - moved, C: seat.shares.C },
  };
}

export interface ToyResult {
  seats: Record<Party, number>;
  /** Average vote share across seats (equal-sized seats) */
  voteShare: Record<Party, number>;
  winners: Party[];
}

export function tally(seats: ToySeat[]): ToyResult {
  const result: ToyResult = {
    seats: { A: 0, B: 0, C: 0 },
    voteShare: { A: 0, B: 0, C: 0 },
    winners: [],
  };
  for (const s of seats) {
    const w = winner(s.shares);
    result.seats[w] += 1;
    result.winners.push(w);
    for (const p of PARTIES) result.voteShare[p] += s.shares[p] / seats.length;
  }
  return result;
}

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
  why: string;
}

export const QUIZ: QuizQuestion[] = [
  {
    q: 'Three candidates get 40%, 35% and 25% of the votes. Who wins the seat?',
    options: ['Nobody, there must be a re-run', 'The candidate with 40%', 'The top two share it'],
    answer: 1,
    why: 'Under first past the post the candidate with the most votes wins, even without a majority.',
  },
  {
    q: 'Can a party with fewer votes statewide win more seats?',
    options: ['No, never', 'Yes, if its votes are spread more efficiently across seats'],
    answer: 1,
    why: 'Seats are won one constituency at a time. Huge wins in a few seats “waste” votes; narrow wins in many seats do not.',
  },
  {
    q: 'A seat was won by a 1% margin. What does that tell you?',
    options: [
      'It is a safe seat',
      'A small shift of votes could change the winner',
      'Turnout was low',
    ],
    answer: 1,
    why: 'Margin measures how close the race was, not turnout. Seats with small margins are the ones most likely to change hands.',
  },
];
