## Current Status

**ADR-006 (routing visibility + reuse gate) — implemented, uncommitted** on branch
`blackhole/adr-006-routing-visibility-reuse-gate`. Workstream A (dashboard `renderRouteChain` +
`computeWaves` + Routing/Waves sections in `scripts/campaign-status.ts`, 17 new TDD tests) and
Workstream B (implementer Reuse Check Gate + reviewer §5 verify/live-grep fallback + worker-schemas
pointer) + C2 (queue-dag route-backfill note) done. `bun test` 272/272, `bun run build` clean,
`VERIFY_SKIP_BUILD=1 bun run verify` 19/19 (V-GROUND-01 vcode count still 33). planner.md +
queue.json schema deliberately untouched. C3 (operational route backfill) is post-merge, not code.
Rollout scope resolved (user): open, non-in-flight only (skip done/merged/closed).
**/x-review-loop: 1 iteration, converged** — 4 WARN findings (0 CRITICAL/HIGH) all fixed:
V-DRY-02/03 (extracted `DONE_STATUSES`/`isDone`), V-DOC-03 (corrected a FALSE "0-byte stub"
claim — investigator.md is actually 106 lines, error propagated from a bad early `ls` read into
ADR/plan/dashboard, now fixed everywhere), V-TEST-01×3 (added unknown-dep/self-cycle/plan_mode
regression tests). Post-fix: bun test 275/275, build clean, verify 19/19. Next: /git-commit.

### Prior work (archival)

ADR-005 (PR merge-gate + dependency-ordering) — COMPLETE and committed on branch
`feature/pr-merge-gate-dependency-ordering` (commits `7fa448d` + `0e07f7d`). All 9 plan
tasks (T1-T9) landed. `/x-review-loop` ran 5 iterations to APPROVED convergence
(Correctness 9/10, Quality 9/10), finding and fixing 10 real issues across the loop —
including a bug that silently defeated gated-batch mode entirely, a merge-throughput DoS,
a permanent-deadlock class, an unreliable cross-attribution mechanism (caught independently
by two reviewers), and an unreachable core mechanism. `bun run build`, `bun run build
--gemini`, `bun run verify` 19/19 clean (no skip flag needed — fully committed, zero
drift), `bun test` 224/224. Ready for PR / next work.

`blackhole-scoped-extraction` (prior initiative, unrelated) is COMPLETE — all 3 milestones
implemented, reviewed, and committed on branch `blackhole/milestone-1-identity-ssot`, bundled
into a single PR ([#90](https://github.com/CorentinLumineau/blackhole/pull/90)) per user
request. Awaiting merge (independent of this work).

ADR-007 implementation COMPLETE (2026-07-11): all 6 tasks merged (#248-#253 → PRs #254-#259). ADR-007 flipped to Accepted. Backlog empty.

## Completed Tasks
ADR-007: T1 walker (PR #254), T2 tracked⇒default (PR #255), T4 link-integrity (PR #256), T3 facts conformance (PR #257), T5 verify decomposition (PR #258), T6 section gate (PR #259). Verify: 26 checks, 366 tests. Earlier: 25-issue campaign, v0.9.0 + v0.10.0.

## Failed Approaches
ADR-007 § Rejected Alternatives (binding): generation-in-place, central registry, orchestrator/worker-schemas splits, mtime cache.

## Next Steps
1. Consider v0.11.0 release (6 merged PRs since v0.10.0: full ADR-007 delivery)
2. Optional: enable kaizen block in .blackhole/config.json for hunted backlog

## Known Limitations
worker-schemas.md split deliberately deferred (watch: >700 LOC or role contract >80 LOC).
