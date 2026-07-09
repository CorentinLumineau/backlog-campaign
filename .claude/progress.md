## Current Status

ADR-005 (PR merge-gate + dependency-ordering) implementation + review COMPLETE on branch
`feature/pr-merge-gate-dependency-ordering` — all 9 plan tasks (T1-T9) landed, uncommitted.
`/x-review-loop` ran 5 iterations to convergence (APPROVED, Correctness 9/10, Quality 9/10):
iter 1 found 5 (1 CRITICAL, 2 HIGH, 2 MEDIUM) incl. a bug that silently defeated gated-batch
mode entirely; iter 2 found 3 more (1 cross-correlated independently by both quality+security
reviewers — unreliable `status`-based V-MERGE attribution) incl. a DoS and a permanent-deadlock
class; iter 3 found 2 (my own fix-propagation staleness — updated merge-gate.md's algorithm
but forgot to sync forge-sync.md's citation of it); iter 4 (past the 3-auto-iteration budget,
user triaged via AskUserQuestion → "Fix selected") found 1 (gated-batch's actual merge-execution
mechanism was fully specified but never wired to any trigger point); iter 5 (hard ceiling)
confirmed clean, zero new findings. All fixes verified: `bun run build` clean, `bun run verify`
19/19 (sanctioned `VERIFY_SKIP_BUILD=1` — plain run correctly shows only the pre-commit
git-diff check failing), `bun test` 224/224, after every one of the 4 fix rounds. Ready to
commit.

`blackhole-scoped-extraction` (prior initiative, unrelated) is COMPLETE — all 3 milestones
implemented, reviewed, and committed on branch `blackhole/milestone-1-identity-ssot`, bundled
into a single PR ([#90](https://github.com/CorentinLumineau/blackhole/pull/90)) per user
request. Awaiting merge (independent of this work).

## Completed Tasks

- **2026-07-09** (uncommitted, branch `feature/pr-merge-gate-dependency-ordering`): T1-T7 of
  `plan-pr-merge-gate-dependency-ordering.md` — `queue-dag.md`/`config-template.md` schema
  fields (T1/T2), new `src/references/merge-gate.md` algorithm doc (T3), `phase-loop.md`
  precondition wiring (T4), `blackhole-vcodes.md` V-MERGE-01/02 rows (T5), `orchestrator.md`
  pointer (T6), `forge-sync.md` steps 5.5/6.6 (T7). Discovery beyond the plan's literal scope
  (mirrors the M3 precedent below): T5's 2 new vcode rows required
  `src/references/ground-truth.md`'s `vcode_table_rows` count bumped 31→33 (V-GROUND-01
  enforces this count mechanically) — not listed in the plan's Critical Files table, fixed as
  a direct, mechanical consequence of T5 rather than unrelated scope creep. `bun run build`
  + `VERIFY_SKIP_BUILD=1 bun run verify` 19/19 pass after every task (V-BUILD-01 itself
  requires a clean git diff, which is structurally impossible pre-commit — skipped
  intentionally via the tooling's own sanctioned escape hatch, confirmed pass will re-check
  after the eventual commit).
- **2026-07-06** (commit `f545fd1`, branch `blackhole/milestone-1-identity-ssot`, PR #90):
  Milestone 1 — `scripts/project-identity.ts` + test extracted; `scripts/build.ts` manifest
  builders (`buildGeminiPluginManifest`, `buildCodexPluginManifest`, `buildCodexMarketplace`,
  `buildClaudePluginManifest`, `buildClaudeMarketplace`) wired to it; `build.ts`'s own
  pre-existing duplicate `package.json` read eliminated. Review-fix loop (1 iteration):
  3-agent swarm found 1 HIGH (V-TEST-01, fixed via extraction) + 1 LOW (accepted as-is per
  reviewer's own recommendation). `bun test` 158/158 pass, `bun run verify` 18/18 pass,
  byte-for-byte manifest regression confirmed twice (before and after the review-fix).
- **2026-07-07** (commits `ceabf10`+`529ed3b`+`2a8e2c4`, same branch, PR #90): Milestone 2 —
  `scripts/tree-shape.ts` + test extracted; `assertGeminiTree`/`assertDistributionTree`/
  `assertCodexTree` removed from `build.ts`; `verify.ts`'s local `validatePluginTreeShape`
  removed and its Codex checks partially folded (safe, non-entangled subset only — 2
  documented deviations from the plan's literal wording, see milestone-2.md). Review-fix loop
  (1 iteration): 3-agent swarm found 3 MEDIUM findings, all fixed via TDD (`INSTRUCTIONS_MARKER`
  constant, `hasInstructionsBlock` predicate, 3 coupling-contract tests). `bun test` 180/180
  pass, `bun run verify` 18/18 pass, byte-for-byte identical output across the full compiled
  tree, re-confirmed after the fix round.
- **2026-07-07** (commits `ca06c7f`+`1e8372c`+`42e6626`, same branch, PR #90): Milestone 3 —
  `documentation/decisions/INDEX.md` created (V-ADA-02 resolved); orphaned
  `src/references/agent-tools.md` deleted + its `ground-truth.md` inventory entry removed +
  `verify.ts`'s `requiredRefs` array updated (discovery beyond the plan's literal scope — a
  direct consumer of the deleted file); `src/agents/coordinator.md`'s unconditional Cursor-only
  reference gated behind `{{#cursor}}...{{/cursor}}`. Review: APPROVED, no fixes needed — one
  reviewer-raised HIGH finding was investigated via `git show` against the pre-fix commit and
  proven factually incorrect (non-Cursor platforms never had functional access to the gated
  content), reclassified to LOW. `bun test` 180/180 pass, `bun run verify` 18/18 pass including
  `V-GROUND-01`. This was the final milestone — the initiative is now complete.

## Failed Approaches

(none)

## Dismissed Clarifications

- Source: `documentation/milestones/_active/blackhole-scoped-extraction/milestone-1.md` (2 markers) — both concern out-of-milestone future scope. Dismissed per user confirmation.

## Next Steps

1. Run `/x-review` on `feature/pr-merge-gate-dependency-ordering` (ADR-005 implementation,
   T1-T9 complete, uncommitted) before committing.
2. Commit + open PR once review passes (`bun run verify` — without `VERIFY_SKIP_BUILD` —
   will pass naturally once the compiled-output diff is committed).
3. Merge PR #90 (all 3 milestones committed, reviewed, PR description updated) — independent
   of the above.
4. Run `/x-initiative archive` for `blackhole-scoped-extraction` once PR #90 merges.
5. Consider filing follow-up issues for the two out-of-scope discoveries below (`.claude/` cleanDir wipe bug; `requiredRefs` 3/6 coverage gap in `checkGroundTruth`)

## Known Limitations

- Out of scope per plan: 3 hidden `spawnSync('bun run build')` channels in `verify.ts`; `author` block in `buildCodexPluginManifest`; `owner.name` in `marketplaceJson`.
- **Confirmed three times now**: `scripts/build.ts`'s `cleanDir(path.join(root, '.claude'))` deletes the *entire* `.claude/` directory recursively — including `.claude/initiatives/` and `.claude/progress.md`, which are NOT build output. Both `bun run build` directly AND `bun run verify` (which internally shells out to `bun run build` via one of `verify.ts`'s 3 hidden `spawnSync` calls — exactly the coupling channel the architectural retrospective flagged as out-of-scope-but-real) wiped these files 3 times this session; each time reconstructed from session context/a manual backup. This is a real, reproducible bug worth filing as a follow-up issue: scope `cleanDir` to only the subdirs `build.ts` actually owns inside `.claude/` (`agents/`, `rules/`, `skills/`), never the whole directory. Workaround for future sessions: back up `.claude/initiatives/` and `.claude/progress.md` before any `bun run build`/`bun run verify` call, restore after.
- **Environment issue**: `x-tester` agent invocation fails in this session with `WorktreeCreate hook failed: hook succeeded but returned no worktree path` — a broken hook, not a code issue. Quality gates were run directly via Bash instead.
- **Discovered during M3 review**: `scripts/verify.ts`'s `checkGroundTruth()` `requiredRefs` array mechanically enforces only 3 of `ground-truth.md`'s 6-entry "References (required)" list (`findings-ledger.md`, `queue-dag.md`, `epic-orchestration.md` are documented but not enforced). Pre-existing, not introduced by this initiative — worth a follow-up issue to either complete the array or parse it directly from `ground-truth.md` to eliminate the duplication.
