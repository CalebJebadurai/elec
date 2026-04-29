# Test Plan: Tech Stack Optimization

**Date:** 2026-04-28  
**Source:** [Full Analysis](../analysis/2026-04-28-tech-stack-evaluation.md)

---

## Performance Baseline (Before Any Changes)
- Run wrk: 10 connections, 30s duration, 5s warmup against local Docker Compose
- Endpoints: stats summary, constituencies, constituency swing, predict data, national state summary
- Record: p50, p95, p99 latency + req/s
- Log to `performance-log.md`

## Unit Tests
- Slim response models: validate sample DB row → correct JSON with expected fields only
- SUM(DISTINCT electors) fix: known test data → expected electorate total
- Materialized view: same results as underlying query
- Cache stampede lock: only one concurrent request executes the expensive query

## Integration Tests
- Full request path per modified endpoint after each optimization
- Cache TTL: second request within TTL returns cached response
- National cache consolidation: value stored in Redis (not just in-memory), survives worker restart
- GCP deployment: full endpoint comparison between Railway and Cloud Run responses
- User data migration: pg_dump/pg_restore preserves all users, bookmarks, votes

## Load Testing
- Tool: k6 or locust from Mumbai cloud instance
- Profile: 80% cached state endpoints, 10% national aggregations, 5% predict data, 5% user ops
- Include cache-cold scenario (flush Redis, then spike) for stampede validation
- Target: 200 req/s sustained, <500ms p95

## Regression Tests
- Golden files: capture query output for TN AE, MH AE, all-India GE before query changes
- Compare post-modification output (row counts, party names, seat totals, vote shares)
- SUM DISTINCT fix: new golden files manually verified against ECI totals
- Store in `api/tests/fixtures/`, sorted JSON, rounded floats

## Edge Cases
- Cache warm-up on startup, cache miss → DB → populate cache
- Admin cache-bust requires admin auth, rejects non-admin (403)
- Trigram search: special chars ("M.K. Stalin"), single char, no matches
- Materialized view: empty result sets (states with no data)
