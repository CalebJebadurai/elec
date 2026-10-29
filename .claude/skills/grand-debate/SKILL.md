---
name: grand-debate
description: Run the grand debate between the 20 stakeholder personas: 10 weighted topics, 4 rounds per topic (intro, critic, answer, conclusion), a Gemini fact-checker that checks every claim with Google Search, 3 judges (left, right, neutral) who score every contribution out of 10 and peer-score each other's verdicts, and an organizer who sets topics 9-10 and writes the final takeaways. Use when the user asks to start, resume, check or explain the grand debate or the persona debate.
---

# Grand Debate

The debate is run by `debate.py` in this folder, not by subagents in this conversation. Each agent turn is a separate, stateless model call that sees only what the script passes it. That keeps agents from sharing memory, and it keeps about 1,000 calls out of this conversation's context.

## Cast
- **Contestants**: the 20 `persona-*` agents in `.claude/agents/`. Each uses its persona with the critique protocol removed and `contestant-protocol.md` added. Contestants get no tools.
- **Fact-checker**: `debate-fact-checker`, run on Gemini 3.8 Flash with Google Search. After each round, one call per contestant contribution checks every factual claim in it. All results form one report for the judges.
- **Judges**: `debate-judge-left`, `debate-judge-right` and `debate-judge-neutral`. They score with no web tools, using the fact-checker's report.
- **Organizer**: `debate-organizer`. With `--project electionanalysis`, topics 1-8 come from `topics-electionanalysis.json` and the organizer sets only topics 9-10 (after reviewing all verdicts on 1-8) and the final takeaways. Every agent also sees `brief-electionanalysis.md` as the agreed facts about the app.

## Flow per topic
1. **Round 1, intro**: every contestant gives an opinion (about 500 words).
2. **Round 2, critic**: every contestant asks 3 questions, each aimed at a named contestant (up to 3 targets).
3. **Round 3, answer**: each contestant answers only the questions aimed at it (about 150 words each). One who received no questions gets no round 3 score.
4. **Round 4, conclusion**: final position (about 300 words), and whether and why the view changed.
- After each round, the fact-checker checks that round's contributions, then the three judges score it:
  - rounds 1 and 4: each contestant out of 10.
  - round 2: each question's quality out of 10 and a weight from 1 to 5. A contestant's round score is quality weighted by weight.
  - round 3: each answer out of 10. A contestant's round score is weighted by the mean weight the judges gave each question.
5. **Verdicts**: each judge writes about 500 words, seeing the transcript and only its own scores, then scores the other two verdicts out of 10, labelled A and B in a shuffled order.

A contestant's topic score is the average of its round scores, each the mean across the three judges. The overall standings weight each topic by its weight.

## Rules the runner enforces
- **Replies are accepted as given.** Nothing is cut or sent back for length or imperfection. Lengths are guidance only.
- **Retries happen only for technical failures**: API errors, rate limits, timeouts, or a reply that isn't parseable JSON.
- Unusable parts are dropped and recorded, not re-asked. Examples: a question aimed at an unknown code, a score outside 0-10 (clamped), an unanswered question (recorded as "[no answer given]"). Each is logged as `accepted_as_given` in `events.csv`.
- A fact-check that gives a verdict without having run a search is recorded as UNCHECKED, not re-asked.
- **Google Search is billed per query**: 5,000 free a month, then $14 per 1,000, with a default cap of 1,500 queries a day. Checking every claim uses roughly 2,000 queries per debate, so a run will probably hit the daily cap. When the quota runs out, the run pauses cleanly; resume it after the reset.

## Isolation and bias controls
- Contestants and judges never share a call. Contestants see nothing from earlier topics. A judge never sees another judge's scores, and sees other verdicts only at peer review.
- Judges, the fact-checker and the organizer see contestants only as random codes (C01-C20). The mapping is in `roster.txt`, which no agent sees. Contestants are told not to name their roles, but their perspective can still give them away.
- Contestants and items are shuffled differently for each judge to remove order effects.
- `judge-calibration.csv` flags any judge more than 1.5 points from the panel average on a topic.

## Running it
Run it in the background from the repository root and tell the user where the output is. Don't paste transcripts into the conversation.

```bash
uv run .claude/skills/grand-debate/debate.py start --project electionanalysis --max-cost 15
```

- Defaults: `--backend api`, Claude Haiku 5.5 at `--effort medium` for contestants, judges and organizer, and the Gemini fact-checker when the Keychain has `gemini-api-key`. The Anthropic key comes from the environment, `.env.local`/`.env`, or the Keychain service `anthropic-api-key`.
- `--model`, `--contestant-model`, `--judge-model` and `--organizer-model` change models. `--fact-checker judges` makes each judge search the web itself instead. `--backend stub` runs the whole pipeline with fake outputs at no cost.
- `--max-cost` pauses the run once estimated token spend passes that many USD. `resume <run-id>` continues from the last completed call; every call is cached in `raw/`. `status [<run-id>]` shows progress and spend.

## Output
Everything is in `debate/runs/<run-id>/` (gitignored). Transcripts are `.txt`; scores are `.csv`; every response carries its timestamp.
- Run level:
  - `config.txt`, `roster.txt`, `brief.txt`, `opening-topics.json.txt`, `topics.txt`
  - `log.txt` and `events.csv`: every call start, finish, retry and failure, each round, and each file write, with timestamps, durations, tokens and cost.
  - `leaderboard.csv`, `judges.csv`, `topic-weights.csv`, `organizer-analysis.txt`, `takeaways.txt`, `usage.txt`
- Per topic, in `topic-NN/`:
  - transcripts: `1-intros.txt`, `2-questions.txt`, `3-answers.txt`, `4-conclusions.txt`, `5-verdicts.txt`
  - scores: `1-intro-scores.csv`, `2-question-scores.csv`, `3-answer-scores.csv`, `4-conclusion-scores.csv`, `round-scores.csv`, `verdict-peer-scores.csv`, `judge-calibration.csv`
  - facts: `fact-checks.csv`, `judge-fact-notes.csv`
- `raw/`: every call's prompt, output, token usage, `requested_at`, `responded_at`, duration and attempts, as JSON in `.txt` files.

## Editing
- The scoring rubric is written out in full in each of the three judge files. Change all three together.
- Contestant rules are in `contestant-protocol.md`. Target lengths, round weights and prices are at the top of `debate.py`.
