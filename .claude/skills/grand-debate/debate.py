#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["anthropic>=1.0", "google-genai>=1.0"]
# ///
"""Grand debate runner: 20 stakeholder personas, 3 judges, a fact-checker and an organizer, 10 topics.

Every agent turn is a separate, stateless model call that sees only the text this
script hands it, so no agent can read another's private work or carry memory between
topics. Transcripts are .txt, scores are .csv, every call and action is timestamped.
Everything lands in debate/runs/<run-id>/ (gitignored).

    uv run .claude/skills/grand-debate/debate.py start --project electionanalysis [--max-cost 15]
    uv run .claude/skills/grand-debate/debate.py resume <run-id>
    uv run .claude/skills/grand-debate/debate.py status [<run-id>]

Defaults: Claude Haiku 5.5 at medium effort for contestants, judges and organizer, and
Gemini 3.8 Flash with Google Search as the fact-checker.

Replies are accepted as given: nothing is cut or sent back for being long, short or
imperfect. A call is retried only for technical failures (API errors, rate limits,
timeouts, or a reply that isn't parseable JSON).

Backends
    api   Anthropic API. Key from ANTHROPIC_API_KEY, .env.local/.env, or the macOS
          Keychain service "anthropic-api-key".
    cli   Headless `claude -p` using your Claude Code login, run from an empty temp
          directory with no tools, settings, MCP, skills or session saving.
    stub  Fake outputs for testing the pipeline. No model calls, no cost.

Fact-checking
    gemini  (default when a Gemini key is found) One Gemini call with Google Search per
            contestant contribution per round, checking every factual claim in it. All
            three judges get the round's report and score without web tools. Key from
            GEMINI_API_KEY, .env.local/.env, or the Keychain service "gemini-api-key".
    judges  Each judge searches the web itself while scoring (Anthropic web search).
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import csv
import datetime as dt
import json
import os
import random
import re
import statistics
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
AGENTS = REPO / ".claude" / "agents"
RUNS = REPO / "debate" / "runs"

JUDGES = ["left", "right", "neutral"]
JUDGE_LABEL = {"left": "Left judge", "right": "Right judge", "neutral": "Neutral judge"}
ROUNDS = {1: "intro", 2: "critic", 3: "answer", 4: "conclusion"}
ROUND_WEIGHTS = {1: 0.25, 2: 0.25, 3: 0.25, 4: 0.25}
# Target lengths given to the models. They are guidance only: replies are never cut or rejected for length.
LIMITS = {"intro": 500, "question": 80, "answer": 150, "conclusion": 300, "verdict": 500, "background": 120}
OPENING_TOPICS = 8
FACT_STATUSES = {"VERIFIED", "FALSE", "MISLEADING", "UNVERIFIABLE"}
SEARCH_ASK = ("You have a web search tool. Use it to check the two or three claims in this round that would most change "
              "a score, and list every check. Mark a claim VERIFIED or FALSE only when you name the source you checked; "
              "a claim judged from memory is UNCHECKED.")
DEFAULT_THEME = (
    "Big, generic questions of principle and policy that all 20 stakeholders can argue from their own lens: "
    "democracy and elections, governance and law, technology and AI, data and privacy, media and information, "
    "economy and business, and society in India and the wider world."
)
# USD per million tokens: input, output, cache read, cache write (5-minute TTL is 1.25x input).
PRICES = {
    "claude-opus-5-5": (4.00, 20.00, 0.20, 5.00),
    "claude-sonnet-5-5": (2.00, 10.00, 0.20, 2.50),
    "claude-haiku-5-5": (0.10, 0.50, 0.01, 0.125),
    # Gemini output includes thinking tokens. Prices double from 1 Jan 2027. Google Search is billed per
    # search query: 5,000 free a month, then $14 per 1,000, with a default cap of 1,500 a day (not in the estimate).
    "gemini-3.8-flash": (0.75, 3.75, 0.075, 0.0),
}
DEFAULT_MODEL = "claude-haiku-5-5"
DEFAULT_EFFORT = "medium"
FACT_MODEL = "gemini-3.8-flash"


class CallFailed(Exception):
    pass


class BudgetReached(Exception):
    pass


class QuotaReached(Exception):
    """A provider quota that won't clear by retrying (for example the daily Google Search cap)."""


# ---------------------------------------------------------------- helpers

def now() -> str:
    return dt.datetime.now().astimezone().isoformat(timespec="milliseconds")


def aim(kind: str) -> str:
    return f"about {LIMITS[kind]} words"


def words(text) -> int:
    return len(str(text or "").split())


def num(value, lo: float, hi: float, default=None):
    """A model's number, clamped into range; None (or default) when it isn't a number."""
    try:
        return min(max(float(value), lo), hi)
    except (TypeError, ValueError):
        return default


def filler(n: int, tag: str = "stub") -> str:
    """Fake text of about n words, so stub runs have realistic prompt sizes for cost estimates."""
    return " ".join(f"{tag}{i % 50}" for i in range(n))


def strip_frontmatter(md: str) -> str:
    if md.startswith("---"):
        end = md.find("\n---", 3)
        if end != -1:
            return md[end + 4 :].lstrip()
    return md


def parse_json(text: str) -> dict:
    """Parse the JSON object from a reply, allowing a ```json fence or surrounding prose."""
    text = (text or "").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    fences = re.findall(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    for candidate in reversed(fences):
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        return json.loads(text[start : end + 1])
    raise json.JSONDecodeError("no JSON object found", text, 0)


def obj(props: dict, required: list | None = None) -> dict:
    return {"type": "object", "properties": props, "required": required or list(props), "additionalProperties": False}


def arr(items: dict) -> dict:
    return {"type": "array", "items": items}


S, N, B = {"type": "string"}, {"type": "number"}, {"type": "boolean"}
FACT_CHECKS = arr(obj({"code": S, "claim": S, "status": S, "note": S}))


# ---------------------------------------------------------------- secrets

def resolve_secret(env_name: str, service: str) -> str | None:
    """Env, then .env.local/.env, then macOS Keychain (see AGENTS.md)."""
    if os.environ.get(env_name, "").strip():
        return os.environ[env_name].strip()
    for name in (".env.local", ".env"):
        path = REPO / name
        if path.exists():
            for line in path.read_text().splitlines():
                if line.strip().startswith(f"{env_name}="):
                    value = line.split("=", 1)[1].strip().strip("'\"")
                    if value:
                        return value
    try:
        out = subprocess.run(
            ["/usr/bin/security", "find-generic-password", "-s", service, "-w"],
            capture_output=True, text=True, timeout=10,
        )
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        pass
    return None


def resolve_api_key() -> str | None:
    return resolve_secret("ANTHROPIC_API_KEY", "anthropic-api-key")


def resolve_gemini_key() -> str | None:
    return resolve_secret("GEMINI_API_KEY", "gemini-api-key")


# ---------------------------------------------------------------- backends
# Each backend retries technical failures itself and raises CallFailed when it gives up.

class ApiBackend:
    def __init__(self, effort: str):
        import anthropic

        self.anthropic = anthropic
        key = resolve_api_key()
        self.client = anthropic.Anthropic(api_key=key, max_retries=4) if key else anthropic.Anthropic(max_retries=4)
        self.effort = effort

    def call(self, system: str, prompt: str, schema: dict, web: bool, model: str) -> tuple[dict, dict]:
        params = {
            "model": model,
            "max_tokens": 32000,
            "system": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
        }
        # Sent as raw body fields so they work whatever the installed SDK's typed signature is.
        body = {"thinking": {"type": "adaptive"}, "output_config": {"effort": self.effort}}
        betas = []
        if not model.startswith("claude-haiku"):  # Haiku has no server-side refusal fallback
            body["fallbacks"] = "default"
            betas = ["server-side-fallback-2026-07-01"]
        if web:
            # Structured outputs aren't combined with server tools here; the reply is parsed instead.
            # Dynamic-filtering search needs Opus/Sonnet; Haiku gets the basic variant.
            search = "web_search_20250305" if model.startswith("claude-haiku") else "web_search_20260209"
            params["tools"] = [{"type": search, "name": "web_search", "max_uses": 5}]
        else:
            body["output_config"]["format"] = {"type": "json_schema", "schema": schema}
        messages = [{"role": "user", "content": prompt}]
        usage = {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0, "web_searches": 0, "model": model}
        for _ in range(6):
            for attempt in range(4):
                try:
                    with self.client.beta.messages.stream(
                        messages=messages, betas=betas, extra_body=body, **params,
                    ) as stream:
                        msg = stream.get_final_message()
                    break
                except self.anthropic.RateLimitError as e:
                    wait = int(e.response.headers.get("retry-after", "60"))
                    time.sleep(min(max(wait, 10), 300))
                except self.anthropic.APIStatusError as e:
                    if e.status_code >= 500 and attempt < 3:
                        time.sleep(30 * (attempt + 1))
                        continue
                    raise CallFailed(f"API error {e.status_code}: {e.message}") from e
                except self.anthropic.APIConnectionError as e:
                    if attempt < 3:
                        time.sleep(30 * (attempt + 1))
                        continue
                    raise CallFailed(f"connection error: {e}") from e
            else:
                raise CallFailed("rate limited too many times")
            u = msg.usage
            usage["input"] += u.input_tokens or 0
            usage["output"] += u.output_tokens or 0
            usage["cache_read"] += getattr(u, "cache_read_input_tokens", 0) or 0
            usage["cache_write"] += getattr(u, "cache_creation_input_tokens", 0) or 0
            stu = getattr(u, "server_tool_use", None)
            usage["web_searches"] += (getattr(stu, "web_search_requests", 0) or 0) if stu else 0
            if msg.stop_reason == "pause_turn":
                messages = [messages[0], {"role": "assistant", "content": msg.content}]
                continue
            if msg.stop_reason == "refusal":
                raise CallFailed("model refused the request")
            text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
            return parse_json(text), usage
        raise CallFailed("web search kept pausing")


class CliBackend:
    def __init__(self, effort: str):
        self.effort = effort

    def call(self, system: str, prompt: str, schema: dict, web: bool, model: str | None) -> tuple[dict, dict]:
        cmd = [
            "claude", "-p",
            "--system-prompt", system,
            "--output-format", "json",
            "--json-schema", json.dumps(schema),
            "--tools", "WebSearch,WebFetch" if web else "",
            "--setting-sources", "",
            "--strict-mcp-config",
            "--disable-slash-commands",
            "--no-session-persistence",
            "--effort", self.effort,
        ]
        if model:
            cmd += ["--model", model]
        # A fresh empty directory per call: no CLAUDE.md, no project memory, no files to read.
        with tempfile.TemporaryDirectory(prefix="debate-call-") as cwd:
            try:
                out = subprocess.run(cmd, input=prompt, capture_output=True, text=True, cwd=cwd, timeout=1800)
            except subprocess.TimeoutExpired as e:
                raise CallFailed("claude -p timed out") from e
        try:
            result = json.loads(out.stdout)
        except json.JSONDecodeError as e:
            raise CallFailed(f"claude -p returned no JSON: {(out.stderr or out.stdout)[:300]}") from e
        if result.get("is_error"):
            raise CallFailed(f"claude -p error: {str(result.get('result'))[:300]}")
        data = result.get("structured_output") or parse_json(result.get("result", ""))
        u = result.get("usage") or {}
        usage = {
            "input": u.get("input_tokens", 0), "output": u.get("output_tokens", 0),
            "cache_read": u.get("cache_read_input_tokens", 0), "cache_write": u.get("cache_creation_input_tokens", 0),
            "web_searches": (u.get("server_tool_use") or {}).get("web_search_requests", 0),
            "cost_usd": result.get("total_cost_usd", 0), "model": model or "cli-default",
        }
        return data, usage


class StubBackend:
    """Returns the task's own fake output. Used to test plumbing without model calls."""

    def call(self, system, prompt, schema, web, model, stub=None):
        return stub(), {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0, "web_searches": 0, "model": "stub"}


def gemini_schema(schema):
    """Gemini's JSON schema support doesn't need additionalProperties; drop it."""
    if isinstance(schema, dict):
        return {k: gemini_schema(v) for k, v in schema.items() if k != "additionalProperties"}
    if isinstance(schema, list):
        return [gemini_schema(v) for v in schema]
    return schema


class GeminiBackend:
    """Gemini with Google Search grounding, used only for the fact-checker."""

    def __init__(self):
        from google import genai
        from google.genai import errors, types

        key = resolve_gemini_key()
        if not key:
            raise SystemExit("No Gemini key found (GEMINI_API_KEY or Keychain service gemini-api-key).")
        self.client, self.types, self.errors = genai.Client(api_key=key), types, errors

    def call(self, system: str, prompt: str, schema: dict, web: bool, model: str) -> tuple[dict, dict]:
        config = self.types.GenerateContentConfig(
            system_instruction=system,
            tools=[self.types.Tool(google_search=self.types.GoogleSearch())] if web else None,
            response_mime_type="application/json",
            # A strict response schema stops Gemini from searching, so with search on the schema is only in the prompt.
            response_json_schema=None if web else gemini_schema(schema),
        )
        for attempt in range(5):
            try:
                r = self.client.models.generate_content(model=model, contents=prompt, config=config)
                break
            except self.errors.APIError as e:
                code = getattr(e, "code", 0)
                if code in (429, 500, 502, 503, 504) and attempt < 4:
                    time.sleep(30 * (attempt + 1))
                    continue
                if code == 429:
                    raise QuotaReached(f"Gemini quota exhausted (probably the 1,500 a day Google Search cap): {e}") from e
                raise CallFailed(f"Gemini error {code}: {e}") from e
        u = r.usage_metadata
        cached = u.cached_content_token_count or 0
        gm = r.candidates[0].grounding_metadata if r.candidates else None
        queries = list(gm.web_search_queries or []) if gm else []
        sources = [{"title": ch.web.title, "uri": ch.web.uri} for ch in (gm.grounding_chunks or []) if ch.web] if gm else []
        usage = {
            "input": (u.prompt_token_count or 0) - cached, "output": (u.candidates_token_count or 0) + (u.thoughts_token_count or 0),
            "cache_read": cached, "cache_write": 0, "web_searches": len(queries), "model": model,
        }
        data = parse_json(r.text or "")
        # Grounding facts ride along so the runner can tell whether a search actually ran.
        data["_searches"], data["_sources"] = queries, sources
        return data, usage


def call_cost(usage: dict) -> float:
    if "cost_usd" in usage:
        return float(usage["cost_usd"] or 0)
    price = PRICES.get(usage.get("model", ""))
    if not price:
        return 0.0
    pin, pout, pread, pwrite = price
    return (usage.get("input", 0) * pin + usage.get("output", 0) * pout + usage.get("cache_read", 0) * pread
            + usage.get("cache_write", 0) * pwrite) / 1e6


# ---------------------------------------------------------------- the run

EVENT_FIELDS = ["timestamp", "event", "key", "role", "model", "duration_s", "input_tokens", "output_tokens",
                "web_searches", "cost_usd", "detail"]


class Run:
    def __init__(self, run_dir: Path, config: dict):
        self.dir = run_dir
        self.cfg = config
        self.raw = run_dir / "raw"
        self.raw.mkdir(parents=True, exist_ok=True)
        self.lock = threading.Lock()
        self.cost = self.spent()
        backend = config["backend"]
        if backend == "api":
            self.backend = ApiBackend(config["effort"])
        elif backend == "cli":
            self.backend = CliBackend(config["effort"])
        else:
            self.backend = StubBackend()
        self.fact_on = config.get("fact_checker") == "gemini"
        self.fact_backend = None
        if self.fact_on:
            self.fact_backend = self.backend if backend == "stub" else GeminiBackend()
        self.personas = load_personas()
        self.code_of = config["roster"]  # persona slug -> code
        self.persona_of = {c: p for p, c in self.code_of.items()}
        self.codes = sorted(self.persona_of)
        self.protocol = (HERE / "contestant-protocol.md").read_text()
        self.brief = Path(config["brief_file"]).read_text().strip() if config.get("brief_file") else ""
        self.judge_notes, self.fact_reports = {}, {}

    # ---- records: log, events, files

    def log(self, msg: str, event: str = "note", **fields):
        stamp = now()
        print(f"[{stamp[11:23]}] {msg}", flush=True)
        with self.lock:
            with open(self.dir / "log.txt", "a") as f:
                f.write(f"[{stamp}] {msg}\n")
            self._event(stamp, event, detail=msg, **fields)

    def _event(self, stamp: str, event: str, **fields):
        path = self.dir / "events.csv"
        new = not path.exists()
        with open(path, "a", newline="") as f:
            w = csv.DictWriter(f, fieldnames=EVENT_FIELDS)
            if new:
                w.writeheader()
            w.writerow({"timestamp": stamp, "event": event, **{k: fields.get(k, "") for k in EVENT_FIELDS[2:]}})

    def event(self, event: str, **fields):
        with self.lock:
            self._event(now(), event, **fields)

    def spent(self) -> float:
        total = 0.0
        for path in self.raw.glob("*.txt"):
            try:
                total += call_cost(json.loads(path.read_text())["usage"])
            except (json.JSONDecodeError, KeyError):
                pass
        return total

    def write(self, rel: str, text: str):
        path = self.dir / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text.rstrip() + "\n")
        self.event("file_written", key=rel)

    def write_csv(self, rel: str, fields: list, rows: list):
        path = self.dir / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
            w.writeheader()
            w.writerows(rows)
        self.event("file_written", key=rel, detail=f"{len(rows)} rows")

    def label(self, code: str) -> str:
        return f"{code} ({self.title(code)})"

    def title(self, code: str) -> str:
        return self.personas[self.persona_of[code]]["title"]

    # ---- one model call, cached on disk so a run can resume

    def ask(self, key: str, role: str, system: str, prompt: str, schema: dict, normalize, stub,
            web: bool = False, backend=None) -> dict:
        """One agent turn. Retries only technical failures; whatever the model returns is accepted.

        normalize(data) tidies the reply (fills gaps, drops unusable items) without ever asking again.
        The saved record holds the prompt, output, usage and timestamps.
        """
        path = self.raw / f"{key}.txt"
        if path.exists():
            return json.loads(path.read_text())["output"]
        if self.cfg["max_cost"] and self.cost >= self.cfg["max_cost"]:
            raise BudgetReached(f"spent ${self.cost:.2f}, the --max-cost limit is ${self.cfg['max_cost']:.2f}")
        model = self.cfg["models"][role]
        full_prompt = (f"{prompt}\n\n---\nReturn only a JSON object matching this schema, with no text outside it:\n"
                       f"{json.dumps(schema)}")
        be = backend or self.backend
        requested = now()
        self.event("call_started", key=key, role=role, model=model)
        t0 = time.monotonic()
        usage_total: dict = {}
        data, attempts = None, 0
        for attempts in range(1, 4):
            try:
                if isinstance(be, StubBackend):
                    data, usage = be.call(system, full_prompt, schema, web, model, stub=stub)
                else:
                    data, usage = be.call(system, full_prompt, schema, web, model)
            except json.JSONDecodeError:
                # An unreadable reply is a technical failure: nothing usable came back.
                self.event("call_retry", key=key, role=role, model=model, detail="reply was not parseable JSON")
                continue
            except CallFailed as e:
                self.event("call_failed", key=key, role=role, model=model, duration_s=f"{time.monotonic() - t0:.1f}",
                           detail=str(e))
                raise
            for k, v in usage.items():
                usage_total[k] = v if isinstance(v, str) else usage_total.get(k, 0) + v
            with self.lock:
                self.cost += call_cost(usage)
            break
        if data is None:
            self.event("call_failed", key=key, role=role, model=model, detail="no parseable JSON after 3 tries")
            raise CallFailed(f"{key}: no parseable JSON after 3 tries")
        data = normalize(data)
        duration = time.monotonic() - t0
        responded = now()
        record = {"key": key, "role": role, "model": model, "requested_at": requested, "responded_at": responded,
                  "duration_s": round(duration, 2), "attempts": attempts, "usage": usage_total,
                  "prompt": full_prompt, "output": data}
        # The prompt is kept so anyone can audit exactly what each agent was shown.
        path.write_text(json.dumps(record, ensure_ascii=False, indent=1))
        self.event("call_finished", key=key, role=role, model=model, duration_s=f"{duration:.1f}",
                   input_tokens=usage_total.get("input", 0) + usage_total.get("cache_read", 0) + usage_total.get("cache_write", 0),
                   output_tokens=usage_total.get("output", 0), web_searches=usage_total.get("web_searches", 0),
                   cost_usd=f"{call_cost(usage_total):.5f}")
        return data

    def stamp(self, key: str) -> str:
        """When a cached call's response arrived."""
        path = self.raw / f"{key}.txt"
        return json.loads(path.read_text()).get("responded_at", "") if path.exists() else ""

    def parallel(self, jobs: dict) -> dict:
        """Run {name: zero-arg callable} concurrently; failures become None and are logged."""
        results = {}
        with cf.ThreadPoolExecutor(max_workers=self.cfg["workers"]) as pool:
            futures = {pool.submit(fn): name for name, fn in jobs.items()}
            for fut in cf.as_completed(futures):
                name = futures[fut]
                try:
                    results[name] = fut.result()
                except (BudgetReached, QuotaReached):
                    raise
                except CallFailed as e:
                    self.log(f"FAILED {name}: {e}", event="failure")
                    results[name] = None
        return results

    def shuffled(self, items: list, *salt) -> list:
        items = list(items)
        random.Random("|".join(map(str, (self.cfg["seed"], *salt)))).shuffle(items)
        return items

    # ---- system prompts

    def contestant_system(self, code: str) -> str:
        return self.personas[self.persona_of[code]]["debate_body"] + "\n\n" + self.protocol

    def agent_system(self, name: str) -> str:
        return strip_frontmatter((AGENTS / f"{name}.md").read_text())

    # ================================================================ organizer

    def topic_schema(self) -> dict:
        return obj({"title": S, "motion": S, "background": S, "weight": N, "weight_reason": S,
                    "contention": N, "contention_reason": S})

    def tidy_topics(self, topics: list) -> list:
        out = []
        whole = lambda x: int(x) if float(x).is_integer() else x
        for t in topics:
            if str(t.get("motion", "")).strip():
                out.append({**t, "title": t.get("title") or t["motion"][:60], "background": t.get("background", ""),
                            "weight": whole(num(t.get("weight"), 1, 10, 5)), "contention": whole(num(t.get("contention"), 0, 10, 5)),
                            "weight_reason": t.get("weight_reason", ""), "contention_reason": t.get("contention_reason", "")})
        return out

    def stub_topics(self, count: int, start: int) -> dict:
        return {"topics": [{
            "title": f"Stub topic {start + i}", "motion": f"This house believes that stub motion {start + i} is right.",
            "background": filler(100), "weight": 5 + i % 5, "weight_reason": filler(25),
            "contention": 7, "contention_reason": filler(25),
        } for i in range(count)]}

    def context(self) -> str:
        """The project brief (if any) or the theme, as the organizer sees it."""
        if self.brief:
            return (f"{self.brief}\n\nEvery topic must be directly about this project: a decision its owner actually "
                    "faces, debatable from both sides.")
        return f"Theme for the grand debate:\n{self.cfg['theme']}"

    def opening_topics(self) -> list:
        if self.cfg.get("topics_file"):
            topics = self.tidy_topics(json.loads(Path(self.cfg["topics_file"]).read_text()))
            if len(topics) != OPENING_TOPICS:
                sys.exit(f"{self.cfg['topics_file']} must hold {OPENING_TOPICS} topics, not {len(topics)}")
            return topics
        prompt = (f"{self.context()}\n\nSet the {OPENING_TOPICS} opening topics, following your rules for setting topics. "
                  f"Background {aim('background')} each.")
        data = self.ask("organizer-topics-01-08", "organizer", self.agent_system("debate-organizer"), prompt,
                        obj({"topics": arr(self.topic_schema())}),
                        lambda d: {"topics": self.tidy_topics(d.get("topics") or [])[:OPENING_TOPICS]},
                        lambda: self.stub_topics(OPENING_TOPICS, 1))
        if not data["topics"]:
            raise CallFailed("the organizer returned no usable topics")
        return data["topics"]

    def verdict_digest(self, n: int, topic: dict, result: dict) -> str:
        lines = [f"## Topic {n}: {topic['title']}", f"Motion: {topic['motion']}", f"Weight: {topic['weight']}"]
        board = sorted(result["topic_scores"].items(), key=lambda kv: -kv[1])
        lines.append("Top 5 contestants: " + ", ".join(f"{c} {s:.2f}" for c, s in board[:5]))
        lines.append("Bottom 3: " + ", ".join(f"{c} {s:.2f}" for c, s in board[-3:]))
        means = {j: statistics.mean(result["judge_means"][j].values()) for j in JUDGES if result["judge_means"].get(j)}
        lines.append("Average score each judge gave: " + ", ".join(f"{JUDGE_LABEL[j]} {m:.2f}" for j, m in means.items()))
        for j in JUDGES:
            v = result["verdicts"].get(j)
            if v:
                lines.append(f"\n### {JUDGE_LABEL[j]} verdict (peer score {result['verdict_scores'].get(j, 0):.1f}/10)\n{v['verdict']}")
        return "\n".join(lines)

    def closing_topics(self, topics: list, results: dict) -> tuple[str, list]:
        digest = "\n\n".join(self.verdict_digest(n, topics[n - 1], results[n]) for n in range(1, OPENING_TOPICS + 1))
        prompt = (f"{self.context()}\n\nTopics 1-{OPENING_TOPICS} are finished. Below are every judge's verdict and "
                  f"anonymised score summaries.\n\n{digest}\n\nWrite your analysis (about 800 words) of what the debate has and "
                  "hasn't settled, then set topics 9 and 10 following your rules. In each new topic's weight_reason, say which "
                  "evidence from the verdicts led to it.")
        data = self.ask("organizer-topics-09-10", "organizer", self.agent_system("debate-organizer"), prompt,
                        obj({"analysis": S, "topics": arr(self.topic_schema())}),
                        lambda d: {"analysis": d.get("analysis", ""), "topics": self.tidy_topics(d.get("topics") or [])[:2]},
                        lambda: {"analysis": filler(700), **self.stub_topics(2, 9)})
        if not data["topics"]:
            raise CallFailed("the organizer returned no usable topics 9 and 10")
        return data["analysis"], data["topics"]

    def takeaways(self, topics: list, results: dict, analysis: str, overall: str) -> dict:
        late = [n for n in sorted(results) if n > OPENING_TOPICS]
        digest = "\n\n".join(self.verdict_digest(n, topics[n - 1], results[n]) for n in late)
        motions = "\n".join(f"{n}. {t['motion']} (weight {t['weight']})" for n, t in enumerate(topics, 1))
        prompt = (f"{self.context()}\n\nAll {len(topics)} topics are finished.\n\nAll motions:\n{motions}\n\n"
                  f"Your analysis after topic {OPENING_TOPICS}:\n{analysis}\n\nVerdicts for the final topics:\n\n{digest}\n\n"
                  f"Overall anonymised standings:\n{overall}\n\nWrite the final takeaways of the grand debate, following your "
                  "rules: a summary of about 400 words, 8 to 15 takeaways, and the questions that remain open.")
        schema = obj({
            "summary": S,
            "takeaways": arr(obj({"takeaway": S, "support": S, "confidence": S, "consensus": S, "dissent": S})),
            "open_questions": arr(S),
        })
        tidy = lambda d: {"summary": d.get("summary", ""), "open_questions": d.get("open_questions") or [],
                          "takeaways": [{k: t.get(k, "") for k in ("takeaway", "support", "confidence", "consensus", "dissent")}
                                        for t in d.get("takeaways") or []]}
        stub = lambda: {"summary": filler(350), "open_questions": [filler(25) for _ in range(5)], "takeaways": [
            {"takeaway": filler(40), "support": filler(25), "confidence": "Low", "consensus": filler(15), "dissent": filler(25)}
            for _ in range(12)]}
        return self.ask("organizer-takeaways", "organizer", self.agent_system("debate-organizer"), prompt, schema, tidy, stub)

    # ================================================================ one topic

    def topic_header(self, n: int, t: dict) -> str:
        head = f"Topic {n}: {t['title']}\nMotion: {t['motion']}\n\nBackground: {t['background']}"
        return f"{self.brief}\n\n---\n\n{head}" if self.brief else head

    def debate_topic(self, n: int, t: dict) -> dict:
        tdir = f"topic-{n:02d}"
        head = self.topic_header(n, t)
        self.log(f"Topic {n} started: {t['title']}", event="topic_started", key=f"t{n:02d}")
        rnd_log = lambda r, what: self.log(f"Topic {n} round {r} ({ROUNDS[r]}): {what}", event="round", key=f"t{n:02d}-r{r}")

        # ---- round 1: intros
        rnd_log(1, "contestants writing intros")

        def intro_job(code):
            prompt = (f"{head}\n\nYou are {code}. Round 1 (intro): give your opinion on the motion in {aim('intro')}, "
                      "plus a one-sentence stance summary.")
            tidy = lambda d: {"stance_summary": str(d.get("stance_summary", "")), "opinion": str(d.get("opinion") or "[empty reply]")}
            stub = lambda: {"stance_summary": filler(25), "opinion": filler(450)}
            return self.ask(f"t{n:02d}-r1-{code}", "contestant", self.contestant_system(code), prompt,
                            obj({"stance_summary": S, "opinion": S}), tidy, stub)

        intros = self.parallel({c: (lambda c=c: intro_job(c)) for c in self.codes})
        intros = {c: (intros.get(c) or {"stance_summary": "[no response]", "opinion": "[no response]"}) for c in self.codes}
        self.write(f"{tdir}/1-intros.txt", head + "\n\n" + "\n\n".join(
            f"=== {self.label(c)} | {words(intros[c]['opinion'])} words | responded {self.stamp(f't{n:02d}-r1-{c}')}\n"
            f"Stance: {intros[c]['stance_summary']}\n\n{intros[c]['opinion']}" for c in self.codes))
        intro_block = lambda order: "\n\n".join(f"--- {c}\n{intros[c]['opinion']}" for c in order)

        rnd_log(1, "fact-checking and judging")
        facts1 = self.fact_round(n, 1, head, {c: intros[c]["opinion"] for c in self.codes})
        r1 = self.judge_contestants(n, 1, head, facts1,
                                    lambda j: f"Round 1 intros (shuffled):\n\n{intro_block(self.shuffled(self.codes, n, 1, j))}")

        # ---- round 2: critic questions
        rnd_log(2, "contestants asking questions")

        def q_job(code):
            others = [c for c in self.shuffled(self.codes, n, 2, code) if c != code]
            prompt = (f"{head}\n\nYou are {code}. Your intro:\n{intros[code]['opinion']}\n\nOther contestants' intros:\n\n"
                      + "\n\n".join(f"--- {c}\n{intros[c]['opinion']}" for c in others)
                      + f"\n\nRound 2 (critic): ask exactly 3 critical questions. Each names one target code (not {code}); "
                      f"you may aim them at one to three contestants. Each question {aim('question')}.")

            def tidy(d):
                # Keep the first 3 questions that name a real, other contestant; anything else can't be routed.
                good = [{"target": q["target"], "question": str(q["question"])} for q in d.get("questions") or []
                        if isinstance(q, dict) and q.get("target") in self.codes and q.get("target") != code
                        and str(q.get("question", "")).strip()]
                return {"questions": good[:3], "dropped": max(len(d.get("questions") or []) - len(good[:3]), 0)}

            stub = lambda: {"questions": [{"target": random.choice(others), "question": filler(70)} for _ in range(3)]}
            return self.ask(f"t{n:02d}-r2-{code}", "contestant", self.contestant_system(code), prompt,
                            obj({"questions": arr(obj({"target": S, "question": S}))}), tidy, stub)

        asked = self.parallel({c: (lambda c=c: q_job(c)) for c in self.codes})
        questions = {}  # qid -> {asker, target, question}
        for c in self.codes:
            got = asked.get(c) or {"questions": []}
            if len(got["questions"]) != 3:
                self.event("accepted_as_given", key=f"t{n:02d}-r2-{c}",
                           detail=f"{len(got['questions'])} usable questions (asked for 3); {got.get('dropped', 0)} unroutable dropped")
            for i, q in enumerate(got["questions"], 1):
                questions[f"{c}-Q{i}"] = {"asker": c, "target": q["target"], "question": q["question"]}
        self.write(f"{tdir}/2-questions.txt", head + "\n\n" + "\n\n".join(
            f"=== {self.label(c)} | responded {self.stamp(f't{n:02d}-r2-{c}')}\n" + "\n".join(
                f"{qid} -> {self.label(q['target'])}: {q['question']}" for qid, q in questions.items() if q["asker"] == c)
            for c in self.codes))

        def q_block(j):
            return (f"Intros, for context:\n\n{intro_block(self.shuffled(self.codes, n, 2, 'ctx', j))}\n\n"
                    "Round 2 questions (shuffled):\n\n" + "\n".join(
                        f"{qid}: from {questions[qid]['asker']} to {questions[qid]['target']}: {questions[qid]['question']}"
                        for qid in self.shuffled(list(questions), n, 2, j)))

        rnd_log(2, "fact-checking and judging")
        facts2 = self.fact_round(n, 2, head, {c: "\n".join(f"{qid} to {q['target']}: {q['question']}"
                                                          for qid, q in questions.items() if q["asker"] == c)
                                              for c in self.codes})
        r2 = self.judge_items(n, 2, head, facts2, q_block, list(questions), with_weight=True)
        weight = {}
        for qid in questions:
            ws = [r2[j][qid]["weight"] for j in r2 if qid in r2[j] and r2[j][qid].get("weight") is not None]
            weight[qid] = statistics.mean(ws) if ws else 3.0

        # ---- round 3: answers
        rnd_log(3, "contestants answering")

        def a_job(code):
            mine = {qid: q for qid, q in questions.items() if q["target"] == code}
            if not mine:
                return {"answers": {}}
            askers = sorted({q["asker"] for q in mine.values()})
            prompt = (f"{head}\n\nYou are {code}. Your intro:\n{intros[code]['opinion']}\n\nIntros of the contestants who "
                      "questioned you:\n\n" + "\n\n".join(f"--- {a}\n{intros[a]['opinion']}" for a in askers)
                      + "\n\nQuestions aimed at you:\n" + "\n".join(f"{qid} (from {q['asker']}): {q['question']}" for qid, q in mine.items())
                      + f"\n\nRound 3 (answers): answer every question above, and only these, by qid. Each answer {aim('answer')}.")

            def tidy(d):
                given = {a.get("qid"): str(a.get("answer", "")) for a in d.get("answers") or [] if isinstance(a, dict)}
                return {"answers": {qid: given.get(qid) or "[no answer given]" for qid in mine},
                        "unanswered": [qid for qid in mine if not given.get(qid)]}

            stub = lambda: {"answers": [{"qid": qid, "answer": filler(130)} for qid in mine]}
            return self.ask(f"t{n:02d}-r3-{code}", "contestant", self.contestant_system(code), prompt,
                            obj({"answers": arr(obj({"qid": S, "answer": S}))}), tidy, stub)

        answered = self.parallel({c: (lambda c=c: a_job(c)) for c in self.codes})
        answers = {qid: "[no response]" for qid in questions}
        for c in self.codes:
            got = answered.get(c) or {}
            answers.update(got.get("answers", {}))
            if got.get("unanswered"):
                self.event("accepted_as_given", key=f"t{n:02d}-r3-{c}", detail=f"unanswered: {', '.join(got['unanswered'])}")
        self.write(f"{tdir}/3-answers.txt", head + "\n\n" + "\n\n".join(
            f"=== {self.label(c)} | responded {self.stamp(f't{n:02d}-r3-{c}') or '-'}\n" + ("\n\n".join(
                f"{qid} from {self.label(q['asker'])}:\nQ: {q['question']}\nA: {answers[qid]}"
                for qid, q in questions.items() if q["target"] == c) or "(no questions received)")
            for c in self.codes))

        def a_block(j):
            return "Round 3 answers (shuffled):\n\n" + "\n\n".join(
                f"{qid}: {questions[qid]['asker']} asked {questions[qid]['target']}: {questions[qid]['question']}\n"
                f"Answer by {questions[qid]['target']}: {answers[qid]}" for qid in self.shuffled(list(questions), n, 3, j))

        rnd_log(3, "fact-checking and judging")
        facts3 = self.fact_round(n, 3, head, {c: "\n\n".join(f"{qid} (asked by {q['asker']}): {q['question']}\nAnswer: {answers[qid]}"
                                                            for qid, q in questions.items() if q["target"] == c)
                                              for c in self.codes})
        r3 = self.judge_items(n, 3, head, facts3, a_block, list(questions), with_weight=False)

        # ---- round 4: conclusions
        rnd_log(4, "contestants concluding")

        def c_job(code):
            mine_asked = [(qid, q) for qid, q in questions.items() if q["asker"] == code]
            mine_got = [(qid, q) for qid, q in questions.items() if q["target"] == code]
            prompt = (f"{head}\n\nYou are {code}. Your intro:\n{intros[code]['opinion']}\n\n"
                      "Questions you asked and the answers you got:\n"
                      + ("\n".join(f"{qid} to {q['target']}: {q['question']}\nAnswer: {answers[qid]}" for qid, q in mine_asked) or "(none)")
                      + "\n\nQuestions you received and your answers:\n"
                      + ("\n".join(f"{qid} from {q['asker']}: {q['question']}\nYour answer: {answers[qid]}" for qid, q in mine_got) or "(none)")
                      + f"\n\nRound 4 (conclusion): your final position in {aim('conclusion')}. Say whether your view changed and why.")
            tidy = lambda d: {"conclusion": str(d.get("conclusion") or "[empty reply]"), "final_stance": str(d.get("final_stance", "")),
                              "view_changed": bool(d.get("view_changed")), "what_changed": str(d.get("what_changed", ""))}
            stub = lambda: {"conclusion": filler(270), "final_stance": filler(25), "view_changed": False, "what_changed": filler(30)}
            return self.ask(f"t{n:02d}-r4-{code}", "contestant", self.contestant_system(code), prompt,
                            obj({"conclusion": S, "final_stance": S, "view_changed": B, "what_changed": S}), tidy, stub)

        concl = self.parallel({c: (lambda c=c: c_job(c)) for c in self.codes})
        concl = {c: (concl.get(c) or {"conclusion": "[no response]", "final_stance": "", "view_changed": False, "what_changed": ""})
                 for c in self.codes}
        self.write(f"{tdir}/4-conclusions.txt", head + "\n\n" + "\n\n".join(
            f"=== {self.label(c)} | {words(concl[c]['conclusion'])} words | responded {self.stamp(f't{n:02d}-r4-{c}')}\n"
            f"Final stance: {concl[c]['final_stance']}\nView changed: "
            f"{'yes: ' + concl[c]['what_changed'] if concl[c]['view_changed'] else 'no'}\n\n{concl[c]['conclusion']}"
            for c in self.codes))

        def c_block(j):
            return "Round 4 (shuffled). For each contestant: their intro, the questions they received, and their conclusion.\n\n" + "\n\n".join(
                f"--- {c}\nIntro:\n{intros[c]['opinion']}\n\nQuestions received: "
                + ("; ".join(q["question"] for q in questions.values() if q["target"] == c) or "none")
                + f"\n\nConclusion (view changed: {concl[c]['view_changed']}):\n{concl[c]['conclusion']}"
                for c in self.shuffled(self.codes, n, 4, j))

        rnd_log(4, "fact-checking and judging")
        facts4 = self.fact_round(n, 4, head, {c: concl[c]["conclusion"] for c in self.codes})
        r4 = self.judge_contestants(n, 4, head, facts4, c_block)

        # ---- aggregate: judge -> round -> code -> score
        per = {j: {r: {} for r in ROUNDS} for j in JUDGES}
        for j in JUDGES:
            per[j][1] = {c: s["score"] for c, s in r1.get(j, {}).items() if s.get("score") is not None}
            per[j][4] = {c: s["score"] for c, s in r4.get(j, {}).items() if s.get("score") is not None}
            for c in self.codes:
                qs = [r2[j][qid] for qid, q in questions.items() if q["asker"] == c and qid in r2.get(j, {})
                      and r2[j][qid].get("quality") is not None]
                if qs:
                    w = [x.get("weight") or 3.0 for x in qs]
                    per[j][2][c] = sum(x["quality"] * wi for x, wi in zip(qs, w)) / sum(w)
                got = [(qid, r3[j][qid]["score"]) for qid, q in questions.items() if q["target"] == c
                       and qid in r3.get(j, {}) and r3[j][qid].get("score") is not None]
                if got:
                    per[j][3][c] = sum(s * weight[qid] for qid, s in got) / sum(weight[qid] for qid, _ in got)
        round_scores = {r: {c: statistics.mean(per[j][r][c] for j in JUDGES if c in per[j][r])
                            for c in self.codes if any(c in per[j][r] for j in JUDGES)} for r in ROUNDS}
        topic_scores = {}
        for c in self.codes:
            parts = [(ROUND_WEIGHTS[r], round_scores[r][c]) for r in ROUNDS if c in round_scores[r]]
            topic_scores[c] = sum(w * s for w, s in parts) / sum(w for w, _ in parts) if parts else 0.0
        judge_means = {j: {c: statistics.mean([per[j][r][c] for r in ROUNDS if c in per[j][r]])
                           for c in self.codes if any(c in per[j][r] for r in ROUNDS)} for j in JUDGES}

        # ---- score files (CSV)
        self.write_score_csvs(n, tdir, questions, r1, r2, r3, r4, weight)

        # ---- verdicts: each judge sees the full transcript and only its own scores
        self.log(f"Topic {n}: judges writing verdicts", event="round", key=f"t{n:02d}-verdicts")
        transcript = self.judge_transcript(intros, questions, answers, concl)

        def v_job(j):
            own = "\n".join(f"{c}: " + ", ".join(f"R{r} {per[j][r][c]:.1f}" for r in ROUNDS if c in per[j][r]) for c in self.codes)
            prompt = (f"{head}\n\nThe four rounds are finished. Full transcript:\n\n{transcript}\n\nYour own round scores:\n{own}\n\n"
                      f"Write your verdict on this topic, following your rules, in {aim('verdict')}. List the codes of the 3 "
                      "contestants who argued best, the points of consensus, the live disagreements and what was left unresolved.")
            tidy = lambda d: {"verdict": str(d.get("verdict") or "[empty reply]"),
                              "best": [b for b in d.get("best") or [] if b in self.codes][:3],
                              **{k: [str(x) for x in d.get(k) or []] for k in ("consensus", "disagreements", "unresolved")}}
            stub = lambda: {"verdict": filler(450), "best": self.codes[:3], "consensus": [filler(25)] * 3,
                            "disagreements": [filler(25)] * 3, "unresolved": [filler(25)] * 2}
            return self.ask(f"t{n:02d}-verdict-{j}", "judge", self.agent_system(f"debate-judge-{j}"), prompt,
                            obj({"verdict": S, "best": arr(S), "consensus": arr(S), "disagreements": arr(S), "unresolved": arr(S)}),
                            tidy, stub)

        verdicts = {j: v for j, v in self.parallel({j: (lambda j=j: v_job(j)) for j in JUDGES}).items() if v}

        # ---- peer review: each judge scores the other two verdicts, labelled A/B in a shuffled order
        self.log(f"Topic {n}: judges peer-reviewing verdicts", event="round", key=f"t{n:02d}-peer")

        def p_job(j):
            others = self.shuffled([k for k in JUDGES if k != j and k in verdicts], n, "peer", j)
            labels = dict(zip("AB", others))
            prompt = (f"{head}\n\nFull transcript:\n\n{transcript}\n\nVerdicts by the other two judges:\n\n"
                      + "\n\n".join(f"--- Verdict {lab}\n{verdicts[k]['verdict']}" for lab, k in labels.items())
                      + "\n\nScore each verdict out of 10, following your peer-review rules, with a rationale of about 60 words.")
            tidy = lambda d: {"reviews": {labels[r["label"]]: {"score": num(r.get("score"), 0, 10), "rationale": str(r.get("rationale", ""))}
                                          for r in d.get("reviews") or [] if isinstance(r, dict) and r.get("label") in labels}}
            stub = lambda: {"reviews": [{"label": lab, "score": 6.5, "rationale": filler(55)} for lab in labels]}
            return self.ask(f"t{n:02d}-peer-{j}", "judge", self.agent_system(f"debate-judge-{j}"), prompt,
                            obj({"reviews": arr(obj({"label": S, "score": N, "rationale": S}))}), tidy, stub)["reviews"]

        peer = {j: v for j, v in self.parallel({j: (lambda j=j: p_job(j)) for j in JUDGES if len(verdicts) > 1}).items() if v}
        verdict_scores = {}
        for k in verdicts:
            vals = [peer[j][k]["score"] for j in peer if k in peer[j] and peer[j][k]["score"] is not None]
            if vals:
                verdict_scores[k] = statistics.mean(vals)
        self.write(f"{tdir}/5-verdicts.txt", head + "\n\n" + "\n\n".join(
            f"=== {JUDGE_LABEL[k]} | peer score {verdict_scores.get(k, 0):.1f}/10 | responded {self.stamp(f't{n:02d}-verdict-{k}')}\n\n"
            f"{verdicts[k]['verdict']}\n\nBest: {', '.join(self.label(b) for b in verdicts[k]['best'])}\n"
            f"Consensus: {'; '.join(verdicts[k]['consensus'])}\nDisagreements: {'; '.join(verdicts[k]['disagreements'])}\n"
            f"Unresolved: {'; '.join(verdicts[k]['unresolved'])}" for k in verdicts))
        self.write_csv(f"{tdir}/verdict-peer-scores.csv",
                       ["topic", "judge_reviewed", "reviewer", "score", "rationale", "reviewer_responded_at", "mean_peer_score"],
                       [{"topic": n, "judge_reviewed": k, "reviewer": j, "score": peer[j][k]["score"],
                         "rationale": peer[j][k]["rationale"], "reviewer_responded_at": self.stamp(f"t{n:02d}-peer-{j}"),
                         "mean_peer_score": f"{verdict_scores.get(k, 0):.2f}"} for j in peer for k in peer[j]])

        self.write_csv(f"{tdir}/round-scores.csv",
                       ["topic", "rank", "contestant", "persona"] + [f"r{r}_{j}" for r in ROUNDS for j in JUDGES + ["mean"]] + ["topic_score"],
                       [{"topic": n, "rank": i, "contestant": c, "persona": self.title(c), "topic_score": f"{s:.3f}",
                         **{f"r{r}_{j}": (f"{per[j][r][c]:.2f}" if c in per[j][r] else "") for r in ROUNDS for j in JUDGES},
                         **{f"r{r}_mean": (f"{round_scores[r][c]:.3f}" if c in round_scores[r] else "") for r in ROUNDS}}
                        for i, (c, s) in enumerate(sorted(topic_scores.items(), key=lambda kv: -kv[1]), 1)])
        panel = [s for j in JUDGES for s in judge_means[j].values()]
        panel_mean = statistics.mean(panel) if panel else 0
        self.write_csv(f"{tdir}/judge-calibration.csv", ["topic", "judge", "mean_score_given", "gap_from_panel", "flagged"],
                       [{"topic": n, "judge": j, "mean_score_given": f"{statistics.mean(judge_means[j].values()):.3f}",
                         "gap_from_panel": f"{statistics.mean(judge_means[j].values()) - panel_mean:+.3f}",
                         "flagged": "yes" if abs(statistics.mean(judge_means[j].values()) - panel_mean) > 1.5 else "no"}
                        for j in JUDGES if judge_means[j]])

        result = {"topic_scores": topic_scores, "round_scores": round_scores, "judge_means": judge_means,
                  "verdicts": verdicts, "verdict_scores": verdict_scores}
        self.write(f"{tdir}/result.json.txt", json.dumps(result, indent=1))
        self.log(f"Topic {n} finished", event="topic_finished", key=f"t{n:02d}")
        return result

    # ---- fact-checking

    def fact_round(self, n: int, rnd: int, head: str, contributions: dict) -> dict | None:
        """One grounded Gemini call per contestant's contribution this round; all results form one report."""
        if not self.fact_on:
            return None
        schema = obj({"checks": arr(obj({"claim": S, "status": S, "source": S, "note": S}))})

        def job(code, text):
            prompt = (f"{head}\n\nRound {rnd} ({ROUNDS[rnd]}) contribution by {code}:\n\n{text}\n\n"
                      "Fact-check this contribution following your rules: find every checkable factual claim in it. Check "
                      "claims about the project against the project brief above (source: \"project brief\"), and run Google "
                      "Search for every other claim (source: the URL). Report the claim, status (VERIFIED, FALSE, MISLEADING or "
                      "UNVERIFIABLE), the source and a one-sentence note. If it makes no checkable factual claims, return an "
                      "empty list.")

            def tidy(d):
                searched = bool(d.get("_searches"))
                checks = []
                for c in d.get("checks") or []:
                    if not isinstance(c, dict) or not str(c.get("claim", "")).strip():
                        continue
                    status, note = str(c.get("status", "")).upper().strip(), str(c.get("note", ""))
                    if status not in FACT_STATUSES:
                        status = "UNVERIFIABLE"
                    from_brief = "brief" in str(c.get("source", "")).lower()
                    if status != "UNVERIFIABLE" and not searched and not from_brief:
                        # No search ran, so a verdict would be from memory: record it honestly instead of asking again.
                        status, note = "UNCHECKED", f"(not searched; the model's own view was {c.get('status')}) {note}"
                    checks.append({"code": code, "claim": str(c["claim"]), "status": status,
                                   "source": str(c.get("source", "")), "note": note})
                return {"checks": checks, "searches": d.get("_searches", []), "sources": d.get("_sources", [])}

            stub = lambda: {"checks": [{"claim": filler(20), "status": "VERIFIED", "source": "https://example.org",
                                        "note": filler(20)} for _ in range(3)], "_searches": ["stub"], "_sources": []}
            return self.ask(f"t{n:02d}-r{rnd}-fc-{code}", "fact_checker", self.agent_system("debate-fact-checker"),
                            prompt, schema, tidy, stub, web=True, backend=self.fact_backend)

        todo = {c: t for c, t in contributions.items() if str(t).strip() and t not in ("[no response]", "[empty reply]")}
        out = self.parallel({c: (lambda c=c, t=t: job(c, t)) for c, t in todo.items()})
        report = {"checks": [], "failed": sorted(c for c in todo if out.get(c) is None), "searches": 0}
        for c in self.codes:
            if out.get(c):
                report["checks"] += out[c]["checks"]
                report["searches"] += len(out[c]["searches"])
                for fc in out[c]["checks"]:
                    fc["checked_at"] = self.stamp(f"t{n:02d}-r{rnd}-fc-{c}")
        self.fact_reports[(n, rnd)] = report
        return report

    def fact_instructions(self, facts: dict | None) -> str:
        if facts is None:
            return SEARCH_ASK
        report = "\n".join(f"- {c['code']}: {c['status']}: {c['claim']} (source: {c.get('source') or 'none'}). {c.get('note', '')}"
                           for c in facts["checks"]) or "- No checkable factual claims were found."
        missing = (f"\nThe fact-checker failed for {', '.join(facts['failed'])}, so their claims were not checked."
                   if facts.get("failed") else "")
        return ("You have no web tools. The panel's independent fact-checker searched the web for every factual claim this "
                f"round and reported:\n{report}{missing}\n\nUse the report: deduct for FALSE or MISLEADING claims in proportion "
                "to how much the argument relies on them; don't deduct for UNVERIFIABLE or UNCHECKED ones. Don't re-check its "
                "findings. In fact_checks, list only claims the report missed that matter, marked UNCHECKED.")

    # ---- judging

    def judge_contestants(self, n: int, rnd: int, head: str, facts, block) -> dict:
        schema = obj({"scores": arr(obj({"code": S, "score": N, "rationale": S})), "fact_checks": FACT_CHECKS})

        def job(j):
            prompt = (f"{head}\n\n{block(j)}\n\nScore every contestant's round {rnd} ({ROUNDS[rnd]}) contribution out of 10, "
                      "following your rules, with a rationale of about 40 words each. " + self.fact_instructions(facts))
            tidy = lambda d: {"by_code": {s["code"]: {"score": num(s.get("score"), 0, 10), "rationale": str(s.get("rationale", ""))}
                                          for s in d.get("scores") or [] if isinstance(s, dict) and s.get("code") in self.codes},
                              "fact_checks": d.get("fact_checks") or []}
            stub = lambda: {"scores": [{"code": c, "score": round(random.uniform(3, 8), 1), "rationale": filler(35)} for c in self.codes],
                            "fact_checks": []}
            return self.ask(f"t{n:02d}-r{rnd}-judge-{j}", "judge", self.agent_system(f"debate-judge-{j}"), prompt, schema,
                            tidy, stub, web=not self.fact_on)

        out = self.parallel({j: (lambda j=j: job(j)) for j in JUDGES})
        self.judge_notes[(n, rnd)] = {j: (out[j] or {}).get("fact_checks", []) for j in JUDGES}
        for j in JUDGES:
            if out.get(j) and len(out[j]["by_code"]) != len(self.codes):
                self.event("accepted_as_given", key=f"t{n:02d}-r{rnd}-judge-{j}",
                           detail=f"scored {len(out[j]['by_code'])} of {len(self.codes)} contestants")
        return {j: out[j]["by_code"] for j in JUDGES if out.get(j)}

    def judge_items(self, n: int, rnd: int, head: str, facts, block, qids: list, with_weight: bool) -> dict:
        if not qids:
            return {}
        field = "quality" if with_weight else "score"
        item = {"qid": S, field: N, "rationale": S}
        if with_weight:
            item["weight"] = N
        schema = obj({"items": arr(obj(item)), "fact_checks": FACT_CHECKS})
        what = ("Score each question's quality out of 10 and give it a weight from 1 to 5"
                if with_weight else "Score each answer out of 10")

        def job(j):
            prompt = (f"{head}\n\n{block(j)}\n\n{what}, following your rules, with a rationale of about 30 words each. "
                      "Use the qid exactly as shown. " + self.fact_instructions(facts))

            def tidy(d):
                items = {}
                for i in d.get("items") or []:
                    if isinstance(i, dict) and i.get("qid") in qids:
                        items[i["qid"]] = {field: num(i.get(field), 0, 10), "rationale": str(i.get("rationale", "")),
                                           **({"weight": num(i.get("weight"), 1, 5)} if with_weight else {})}
                return {"items": items, "fact_checks": d.get("fact_checks") or []}

            stub = lambda: {"items": [{"qid": q, field: round(random.uniform(3, 8), 1), "rationale": filler(28),
                                       **({"weight": random.randint(1, 5)} if with_weight else {})} for q in qids], "fact_checks": []}
            return self.ask(f"t{n:02d}-r{rnd}-judge-{j}", "judge", self.agent_system(f"debate-judge-{j}"), prompt, schema,
                            tidy, stub, web=not self.fact_on)

        out = self.parallel({j: (lambda j=j: job(j)) for j in JUDGES})
        self.judge_notes[(n, rnd)] = {j: (out[j] or {}).get("fact_checks", []) for j in JUDGES}
        for j in JUDGES:
            if out.get(j) and len(out[j]["items"]) != len(qids):
                self.event("accepted_as_given", key=f"t{n:02d}-r{rnd}-judge-{j}", detail=f"scored {len(out[j]['items'])} of {len(qids)} items")
        return {j: out[j]["items"] for j in JUDGES if out.get(j)}

    def judge_transcript(self, intros, questions, answers, concl) -> str:
        parts = ["ROUND 1: INTROS"] + [f"--- {c}\n{intros[c]['opinion']}" for c in self.codes]
        parts += ["ROUND 2 AND 3: QUESTIONS AND ANSWERS"] + [
            f"{qid}: {q['asker']} asked {q['target']}: {q['question']}\nAnswer: {answers[qid]}" for qid, q in questions.items()]
        parts += ["ROUND 4: CONCLUSIONS"] + [f"--- {c} (view changed: {concl[c]['view_changed']})\n{concl[c]['conclusion']}" for c in self.codes]
        return "\n\n".join(parts)

    # ---- score CSVs

    def write_score_csvs(self, n, tdir, questions, r1, r2, r3, r4, weight):
        for rnd, scores, name in ((1, r1, "1-intro-scores.csv"), (4, r4, "4-conclusion-scores.csv")):
            self.write_csv(f"{tdir}/{name}", ["topic", "round", "contestant", "persona", "judge", "score", "rationale", "scored_at"],
                           [{"topic": n, "round": rnd, "contestant": c, "persona": self.title(c), "judge": j,
                             "score": scores[j][c]["score"], "rationale": scores[j][c]["rationale"],
                             "scored_at": self.stamp(f"t{n:02d}-r{rnd}-judge-{j}")}
                            for c in self.codes for j in JUDGES if c in scores.get(j, {})])
        self.write_csv(f"{tdir}/2-question-scores.csv",
                       ["topic", "qid", "asker", "asker_persona", "target", "target_persona", "question", "judge", "quality",
                        "weight", "rationale", "scored_at"],
                       [{"topic": n, "qid": qid, "asker": q["asker"], "asker_persona": self.title(q["asker"]), "target": q["target"],
                         "target_persona": self.title(q["target"]), "question": q["question"], "judge": j,
                         "quality": r2[j][qid]["quality"], "weight": r2[j][qid].get("weight"), "rationale": r2[j][qid]["rationale"],
                         "scored_at": self.stamp(f"t{n:02d}-r2-judge-{j}")}
                        for qid, q in questions.items() for j in JUDGES if qid in r2.get(j, {})])
        self.write_csv(f"{tdir}/3-answer-scores.csv",
                       ["topic", "qid", "answerer", "answerer_persona", "asker", "question_weight", "judge", "score", "rationale", "scored_at"],
                       [{"topic": n, "qid": qid, "answerer": q["target"], "answerer_persona": self.title(q["target"]), "asker": q["asker"],
                         "question_weight": f"{weight[qid]:.2f}", "judge": j, "score": r3[j][qid]["score"],
                         "rationale": r3[j][qid]["rationale"], "scored_at": self.stamp(f"t{n:02d}-r3-judge-{j}")}
                        for qid, q in questions.items() for j in JUDGES if qid in r3.get(j, {})])
        fact_rows, note_rows = [], []
        for rnd in ROUNDS:
            report = self.fact_reports.get((n, rnd))
            for fc in (report or {}).get("checks", []):
                fact_rows.append({"topic": n, "round": rnd, "contestant": fc["code"], "persona": self.title(fc["code"]),
                                  "claim": fc["claim"], "status": fc["status"], "source": fc["source"], "note": fc["note"],
                                  "checked_at": fc.get("checked_at", "")})
            for j, notes in self.judge_notes.get((n, rnd), {}).items():
                for fc in notes:
                    if isinstance(fc, dict):
                        note_rows.append({"topic": n, "round": rnd, "judge": j, "contestant": fc.get("code", ""),
                                          "claim": fc.get("claim", ""), "status": fc.get("status", ""), "note": fc.get("note", "")})
        self.write_csv(f"{tdir}/fact-checks.csv", ["topic", "round", "contestant", "persona", "claim", "status", "source", "note",
                                                   "checked_at"], fact_rows)
        self.write_csv(f"{tdir}/judge-fact-notes.csv", ["topic", "round", "judge", "contestant", "claim", "status", "note"], note_rows)

    # ================================================================ whole debate

    def run(self):
        self.log(f"Run {self.dir.name} started", event="run_started")
        topics = self.opening_topics()
        results = {}
        self.write("topics.txt", self.topics_text(topics))
        for n in range(1, OPENING_TOPICS + 1):
            results[n] = self.debate_topic(n, topics[n - 1])
            self.write_leaderboard(topics, results)
        self.log("Organizer is reviewing topics 1-8 and setting topics 9 and 10", event="organizer")
        analysis, extra = self.closing_topics(topics, results)
        topics = topics + extra
        self.write("organizer-analysis.txt", f"Organizer analysis after topic {OPENING_TOPICS} | responded "
                   f"{self.stamp('organizer-topics-09-10')}\n\n{analysis}")
        self.write("topics.txt", self.topics_text(topics))
        for n in range(OPENING_TOPICS + 1, len(topics) + 1):
            results[n] = self.debate_topic(n, topics[n - 1])
            self.write_leaderboard(topics, results)
        self.log("Organizer is writing the final takeaways", event="organizer")
        overall = self.write_leaderboard(topics, results, anonymous=True)
        tk = self.takeaways(topics, results, analysis, overall)
        self.write("takeaways.txt", f"Grand debate: final takeaways | responded {self.stamp('organizer-takeaways')}\n\n"
                   + tk["summary"] + "\n\n" + "\n\n".join(
            f"{i}. {t['takeaway']}\n   Support: {t['support']}\n   Confidence: {t['confidence']}\n   Consensus: {t['consensus']}\n"
            f"   Strongest dissent: {t['dissent']}" for i, t in enumerate(tk["takeaways"], 1))
            + "\n\nOpen questions:\n" + "\n".join(f"- {q}" for q in tk["open_questions"]))
        self.write_usage()
        self.log(f"Run finished. Results are in {self.dir}", event="run_finished")

    def topics_text(self, topics) -> str:
        return "Grand debate topics\n\n" + "\n\n".join(
            f"{n}. {t['title']}\n   Motion: {t['motion']}\n   Background: {t['background']}\n"
            f"   Weight: {t['weight']}/10 ({t['weight_reason']})\n   Contention: {t['contention']}/10 ({t['contention_reason']})"
            for n, t in enumerate(topics, 1))

    def write_leaderboard(self, topics, results, anonymous=False) -> str:
        done = sorted(results)
        total_w = sum(float(topics[n - 1]["weight"]) for n in done)
        overall = {c: sum(float(topics[n - 1]["weight"]) * results[n]["topic_scores"].get(c, 0) for n in done) / total_w
                   for c in self.codes}
        board = sorted(overall.items(), key=lambda kv: -kv[1])
        if anonymous:
            return "\n".join(f"{i}. {c} {s:.2f}" for i, (c, s) in enumerate(board, 1))
        self.write_csv("leaderboard.csv", ["rank", "contestant", "persona"] + [f"topic_{n}" for n in done] + ["overall_weighted"],
                       [{"rank": i, "contestant": c, "persona": self.title(c), "overall_weighted": f"{s:.3f}",
                         **{f"topic_{n}": f"{results[n]['topic_scores'].get(c, 0):.3f}" for n in done}}
                        for i, (c, s) in enumerate(board, 1)])
        self.write_csv("judges.csv", ["judge"] + [f"topic_{n}_peer_score" for n in done] + ["mean_peer_score"],
                       [{"judge": j, **{f"topic_{n}_peer_score": (f"{results[n]['verdict_scores'][j]:.2f}"
                                                                 if j in results[n]["verdict_scores"] else "") for n in done},
                         "mean_peer_score": (f"{statistics.mean(v):.2f}" if (v := [results[n]['verdict_scores'][j] for n in done
                                                                                 if j in results[n]['verdict_scores']]) else "")}
                        for j in JUDGES])
        self.write_csv("topic-weights.csv", ["topic", "title", "weight", "contention"],
                       [{"topic": n, "title": t["title"], "weight": t["weight"], "contention": t["contention"]}
                        for n, t in enumerate(topics, 1)])
        self.write_usage()
        return ""

    def write_usage(self):
        calls, totals, by_role = 0, {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0, "web_searches": 0}, {}
        for path in self.raw.glob("*.txt"):
            rec = json.loads(path.read_text())
            u = rec.get("usage", {})
            calls += 1
            for k in totals:
                totals[k] += u.get(k, 0)
            r = by_role.setdefault(rec.get("role", "?"), [0, 0.0])
            r[0] += 1
            r[1] += call_cost(u)
        self.write("usage.txt", f"Updated {now()}\nModel calls: {calls}\n" + "\n".join(f"{k}: {v:,}" for k, v in totals.items())
                   + "\n\nBy role:\n" + "\n".join(f"  {k}: {v[0]} calls, ${v[1]:.3f}" for k, v in sorted(by_role.items()))
                   + f"\n\nEstimated cost: ${self.spent():.2f} (tokens only; Google Search beyond the free allowance is extra)")


# ---------------------------------------------------------------- personas, config, CLI

def load_personas() -> dict:
    personas = {}
    for path in sorted(AGENTS.glob("persona-*.md")):
        body = strip_frontmatter(path.read_text())
        title = re.search(r"^# Persona: (?:The )?(.+)$", body, re.M)
        cut = body.find("## Operating protocol")
        debate_body = body[:cut].rstrip().rstrip("-").rstrip() if cut != -1 else body
        personas[path.stem] = {"title": title.group(1).strip() if title else path.stem, "debate_body": debate_body}
    if len(personas) != 20:
        sys.exit(f"Expected 20 persona agents in {AGENTS}, found {len(personas)}")
    return personas


def new_config(args) -> dict:
    seed = args.seed if args.seed is not None else random.randrange(10**9)
    slugs = sorted(load_personas())
    codes = [f"C{i:02d}" for i in range(1, 21)]
    random.Random(seed).shuffle(slugs)
    default_model = None if args.backend == "cli" else DEFAULT_MODEL
    return {
        "theme": args.theme, "backend": args.backend, "effort": args.effort, "workers": args.workers,
        "max_cost": args.max_cost, "seed": seed, "created": now(),
        "models": {"contestant": args.contestant_model or args.model or default_model,
                   "judge": args.judge_model or args.model or default_model,
                   "organizer": args.organizer_model or args.model or default_model,
                   "fact_checker": args.fact_checker_model},
        "fact_checker": args.fact_checker,
        "topics_file": str(Path(args.topics_file).resolve()) if args.topics_file else None,
        "brief_file": str(Path(args.brief_file).resolve()) if args.brief_file else None,
        "roster": dict(zip(slugs, codes)),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    st = sub.add_parser("start", help="start a new debate")
    st.add_argument("--theme", default=DEFAULT_THEME)
    st.add_argument("--backend", choices=["api", "cli", "stub"], default="api")
    st.add_argument("--model", help=f"model for contestants, judges and organizer (default {DEFAULT_MODEL})")
    st.add_argument("--contestant-model")
    st.add_argument("--judge-model")
    st.add_argument("--organizer-model")
    st.add_argument("--effort", default=DEFAULT_EFFORT, choices=["low", "medium", "high", "xhigh", "max"])
    st.add_argument("--fact-checker", choices=["gemini", "judges"],
                    help="gemini: Gemini + Google Search checks every claim; judges: each judge searches (default gemini if a key is found)")
    st.add_argument("--fact-checker-model", default=FACT_MODEL)
    st.add_argument("--topics-file", help="JSON list of the 8 opening topics; skips the organizer's topic setting")
    st.add_argument("--brief-file", help="factual brief on a project; every agent sees it and all topics are about it")
    st.add_argument("--project", choices=["electionanalysis"],
                    help="shortcut for this folder's topics-<project>.json and brief-<project>.md")
    st.add_argument("--workers", type=int, default=4, help="parallel calls within a round")
    st.add_argument("--max-cost", type=float, default=0, help="stop (resumably) once estimated spend passes this many USD")
    st.add_argument("--seed", type=int)
    st.add_argument("--run-id")
    rs = sub.add_parser("resume", help="continue a stopped run")
    rs.add_argument("run_id")
    rs.add_argument("--max-cost", type=float)
    rs.add_argument("--workers", type=int)
    ss = sub.add_parser("status", help="show progress and spend")
    ss.add_argument("run_id", nargs="?")
    args = ap.parse_args()

    if args.cmd == "status":
        runs = sorted(p for p in RUNS.glob("*") if p.is_dir()) if RUNS.exists() else []
        run_dir = RUNS / args.run_id if args.run_id else (runs[-1] if runs else None)
        if not run_dir or not run_dir.exists():
            sys.exit("No runs yet.")
        cfg = json.loads((run_dir / "config.txt").read_text())
        n = len(list((run_dir / "raw").glob("*.txt")))
        print(f"Run {run_dir.name} ({cfg['backend']}, {cfg['models']}), {n} calls done")
        log = run_dir / "log.txt"
        print(log.read_text().splitlines()[-1] if log.exists() else "")
        if (run_dir / "usage.txt").exists():
            print((run_dir / "usage.txt").read_text())
        return

    if args.cmd == "start":
        run_id = args.run_id or dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        run_dir = RUNS / run_id
        if run_dir.exists():
            sys.exit(f"{run_dir} already exists; use resume")
        if args.project:
            args.topics_file = args.topics_file or str(HERE / f"topics-{args.project}.json")
            args.brief_file = args.brief_file or str(HERE / f"brief-{args.project}.md")
        if not args.fact_checker:
            args.fact_checker = "gemini" if (args.backend == "stub" or resolve_gemini_key()) else "judges"
        cfg = new_config(args)
        if cfg["backend"] == "api" and not resolve_api_key():
            sys.exit("No Anthropic API key found. Add one to the Keychain without it entering shell history:\n"
                     "  security add-generic-password -a \"$USER\" -s anthropic-api-key -U -w\n"
                     "(it prompts for the key), or use --backend cli to run on your Claude Code login.")
        run_dir.mkdir(parents=True)
        # Freeze the brief and topics inside the run, so editing the originals can't change a run mid-way.
        for key, name in (("brief_file", "brief.txt"), ("topics_file", "opening-topics.json.txt")):
            if cfg[key]:
                (run_dir / name).write_text(Path(cfg[key]).read_text())
                cfg[key] = str(run_dir / name)
        (run_dir / "config.txt").write_text(json.dumps(cfg, indent=1))
        roster = sorted(cfg["roster"].items(), key=lambda kv: kv[1])
        personas = load_personas()
        (run_dir / "roster.txt").write_text("Contestant codes (no agent ever sees this file)\n\n"
                                            + "\n".join(f"{c}  {personas[p]['title']}  ({p})" for p, c in roster) + "\n")
    else:
        run_dir = RUNS / args.run_id
        cfg = json.loads((run_dir / "config.txt").read_text())
        if args.max_cost is not None:
            cfg["max_cost"] = args.max_cost
        if args.workers:
            cfg["workers"] = args.workers
        (run_dir / "config.txt").write_text(json.dumps(cfg, indent=1))

    run = Run(run_dir, cfg)
    run.log(f"{args.cmd}: backend {cfg['backend']}, effort {cfg['effort']}, models {cfg['models']}, "
            f"fact-checker {cfg.get('fact_checker')}", event=args.cmd)
    try:
        run.run()
    except (BudgetReached, QuotaReached) as e:
        run.write_usage()
        run.log(f"Paused: {e}. Resume with: debate.py resume {run_dir.name}"
                + (" --max-cost <higher>" if isinstance(e, BudgetReached) else " (after the quota resets)"), event="paused")
        sys.exit(2)


if __name__ == "__main__":
    main()
