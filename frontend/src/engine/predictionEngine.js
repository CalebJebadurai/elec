import { normalizeParty } from '../constants';

/**
 * Generate baseline predictions from latest actuals.
 *
 * For each constituency:
 * 1. Scale electors by growth factor (next total / latest total)
 * 2. Compute expected valid votes = scaled_electors * turnoutPct
 * 3. Apply anti-incumbency: incumbent party loses antiIncumbencyPct% of its
 *    vote_share, distributed proportionally to the runner-up.
 * 4. Recalculate absolute votes from adjusted shares.
 */
export function generateBaseline(constituencies, params) {
  const { antiIncumbencyPct, turnoutPct, growthFactor } = params;
  const antiInc = antiIncumbencyPct / 100;
  const turnout = turnoutPct / 100;

  return constituencies.map((c) => {
    const scaledElectors = Math.round((c.electors_latest || 0) * growthFactor);
    const expectedValidVotes = Math.round(scaledElectors * turnout);

    // Build party vote shares from latest candidates
    let parties = (c.candidates_latest || []).map((cand) => ({
      party: normalizeParty(cand.party),
      originalParty: cand.party,
      voteShare: (cand.vote_share_percentage || 0) / 100,
      position: cand.position,
    }));

    if (parties.length === 0) return emptyResult(c);

    // Apply anti-incumbency: latest winner loses share, runner-up gains
    const incumbentParty = normalizeParty(c.winner_party_latest);
    if (antiInc > 0 && incumbentParty) {
      const incumbentIdx = parties.findIndex(
        (p) => p.party === incumbentParty && p.position === 1
      );
      const runnerUpIdx = parties.findIndex((p) => p.position === 2);

      if (incumbentIdx >= 0) {
        const loss = parties[incumbentIdx].voteShare * antiInc;
        parties[incumbentIdx].voteShare -= loss;

        if (runnerUpIdx >= 0) {
          parties[runnerUpIdx].voteShare += loss * 0.7;
          // Remaining 30% distributed to others
          const otherIdxs = parties
            .map((_, i) => i)
            .filter((i) => i !== incumbentIdx && i !== runnerUpIdx);
          const perOther =
            otherIdxs.length > 0
              ? (loss * 0.3) / otherIdxs.length
              : 0;
          otherIdxs.forEach((i) => {
            parties[i].voteShare += perOther;
          });
        }
      }
    }

    // Normalize shares to sum to 1
    const totalShare = parties.reduce((s, p) => s + p.voteShare, 0);
    if (totalShare > 0) {
      parties.forEach((p) => {
        p.voteShare = p.voteShare / totalShare;
      });
    }

    // Compute votes
    parties.forEach((p) => {
      p.votes = Math.round(p.voteShare * expectedValidVotes);
    });

    // Sort by votes desc
    parties.sort((a, b) => b.votes - a.votes);

    const winner = parties[0];
    const runnerUp = parties[1];

    return {
      constituency_name: c.constituency_name,
      constituency_no: c.constituency_no,
      constituency_type: c.constituency_type,
      district_name: c.district_name,
      sub_region: c.sub_region,
      electors_next: scaledElectors,
      valid_votes_next: expectedValidVotes,
      winner_party_latest: normalizeParty(c.winner_party_latest),
      margin_percentage_latest: c.margin_percentage_latest,
      predicted_winner: winner.party,
      predicted_winner_votes: winner.votes,
      predicted_winner_share: winner.voteShare * 100,
      predicted_runner_up: runnerUp ? runnerUp.party : null,
      predicted_runner_up_votes: runnerUp ? runnerUp.votes : 0,
      predicted_margin: winner.votes - (runnerUp ? runnerUp.votes : 0),
      predicted_margin_pct:
        expectedValidVotes > 0
          ? ((winner.votes - (runnerUp ? runnerUp.votes : 0)) /
              expectedValidVotes) *
            100
          : 0,
      flipped: winner.party !== normalizeParty(c.winner_party_latest),
      parties,
    };
  });
}

/**
 * Apply a new party to baseline predictions using affinity-weighted redistribution.
 *
 * For each constituency:
 *   new_votes = valid_votes * (statewide_pct or constituency_override)
 *   loss_i = new_votes * (alpha_i * V_i) / sum(alpha_j * V_j)
 *
 * This ensures vote conservation: total subtracted = new party votes.
 */
export function applyNewParty(baselineResults, config) {
  const {
    name,
    color,
    statewideVoteShare,
    affinityWeights,
    constituencyOverrides,
  } = config;

  if (!name || statewideVoteShare <= 0) return baselineResults;

  return baselineResults.map((r) => {
    const overridePct =
      constituencyOverrides[r.constituency_name] ?? statewideVoteShare;
    const newPartyShare = overridePct / 100;

    if (newPartyShare <= 0) return r;

    const validVotes = r.valid_votes_next;
    const newPartyVotes = Math.round(validVotes * newPartyShare);

    // Clone parties
    let parties = r.parties.map((p) => ({ ...p }));

    // Compute weighted denominator
    const getWeight = (party) => {
      if (affinityWeights[party] !== undefined) return affinityWeights[party];
      return affinityWeights['Others'] || 0.1;
    };

    let weightedSum = 0;
    parties.forEach((p) => {
      weightedSum += getWeight(p.party) * p.votes;
    });

    // Subtract from existing parties
    if (weightedSum > 0) {
      parties.forEach((p) => {
        const loss = (newPartyVotes * getWeight(p.party) * p.votes) / weightedSum;
        p.votes = Math.max(0, Math.round(p.votes - loss));
      });
    }

    // Recompute vote shares
    const totalVotesAfter = parties.reduce((s, p) => s + p.votes, 0) + newPartyVotes;
    parties.forEach((p) => {
      p.voteShare = totalVotesAfter > 0 ? p.votes / totalVotesAfter : 0;
    });

    // Add new party
    parties.push({
      party: name,
      originalParty: name,
      voteShare: totalVotesAfter > 0 ? newPartyVotes / totalVotesAfter : 0,
      votes: newPartyVotes,
      position: null,
      isNewParty: true,
    });

    // Sort by votes desc
    parties.sort((a, b) => b.votes - a.votes);

    const winner = parties[0];
    const runnerUp = parties[1];

    return {
      ...r,
      predicted_winner: winner.party,
      predicted_winner_votes: winner.votes,
      predicted_winner_share: winner.voteShare * 100,
      predicted_runner_up: runnerUp ? runnerUp.party : null,
      predicted_runner_up_votes: runnerUp ? runnerUp.votes : 0,
      predicted_margin: winner.votes - (runnerUp ? runnerUp.votes : 0),
      predicted_margin_pct:
        totalVotesAfter > 0
          ? ((winner.votes - (runnerUp ? runnerUp.votes : 0)) /
              totalVotesAfter) *
            100
          : 0,
      flipped: winner.party !== r.winner_party_latest,
      parties,
      new_party_votes: newPartyVotes,
      new_party_share: newPartyVotes > 0 ? (newPartyVotes / totalVotesAfter) * 100 : 0,
    };
  });
}

/**
 * Aggregate per-constituency results into summary stats.
 */
export function aggregateResults(predictions) {
  const partySeats = {};
  const partyVoteShares = {};
  const partyVoteCounts = {};
  const flipped = [];
  let totalSeats = 0;

  predictions.forEach((r) => {
    const w = r.predicted_winner;
    if (!w) return;
    totalSeats++;

    partySeats[w] = (partySeats[w] || 0) + 1;

    // Track vote share sums for averaging
    (r.parties || []).forEach((p) => {
      if (!partyVoteShares[p.party]) {
        partyVoteShares[p.party] = { sum: 0, count: 0, totalVotes: 0 };
      }
      partyVoteShares[p.party].sum += p.voteShare * 100;
      partyVoteShares[p.party].count += 1;
      partyVoteShares[p.party].totalVotes += p.votes;
    });

    if (r.flipped) {
      flipped.push({
        constituency: r.constituency_name,
        from: r.winner_party_latest,
        to: r.predicted_winner,
        margin_latest: r.margin_percentage_latest,
        margin_next: r.predicted_margin_pct,
      });
    }
  });

  // Build party summary sorted by seats
  const parties = Object.keys({ ...partySeats, ...partyVoteShares })
    .map((party) => ({
      party,
      seats: partySeats[party] || 0,
      avgVoteShare:
        partyVoteShares[party]
          ? partyVoteShares[party].sum / partyVoteShares[party].count
          : 0,
      totalVotes: partyVoteShares[party]?.totalVotes || 0,
    }))
    .sort((a, b) => b.seats - a.seats || b.avgVoteShare - a.avgVoteShare);

  return {
    totalSeats,
    parties,
    flipped,
    flippedCount: flipped.length,
  };
}

function emptyResult(c) {
  return {
    constituency_name: c.constituency_name,
    constituency_no: c.constituency_no,
    constituency_type: c.constituency_type,
    district_name: c.district_name,
    sub_region: c.sub_region,
    electors_next: 0,
    valid_votes_next: 0,
    winner_party_latest: null,
    margin_percentage_latest: null,
    predicted_winner: null,
    predicted_winner_votes: 0,
    predicted_winner_share: 0,
    predicted_runner_up: null,
    predicted_runner_up_votes: 0,
    predicted_margin: 0,
    predicted_margin_pct: 0,
    flipped: false,
    parties: [],
  };
}
