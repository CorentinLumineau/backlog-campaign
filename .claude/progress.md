## Current Status

Milestone 1 (Identity SSOT) — committed (PR #90). Milestone 2 (Tree-Shape SSOT) of the
`blackhole-scoped-extraction` initiative is implemented, reviewed (3 MEDIUM findings, all
fixed), and gate-verified on the SAME branch `blackhole/milestone-1-identity-ssot`, per user
request to bundle M1-M3 into one PR. Ready to commit.

## Completed Tasks

- **2026-07-06** (commit `f545fd1`, branch `blackhole/milestone-1-identity-ssot`, PR #90):
  Milestone 1 — `scripts/project-identity.ts` + test extracted; `scripts/build.ts` manifest
  builders (`buildGeminiPluginManifest`, `buildCodexPluginManifest`, `buildCodexMarketplace`,
  `buildClaudePluginManifest`, `buildClaudeMarketplace`) wired to it; `build.ts`'s own
  pre-existing duplicate `package.json` read eliminated. Review-fix loop (1 iteration):
  3-agent swarm found 1 HIGH (V-TEST-01, fixed via extraction) + 1 LOW (accepted as-is per
  reviewer's own recommendation). `bun test` 158/158 pass, `bun run verify` 18/18 pass,
  byte-for-byte manifest regression confirmed twice (before and after the review-fix).
- **2026-07-07** (uncommitted, same branch): Milestone 2 — `scripts/tree-shape.ts` + test
  extracted; `assertGeminiTree`/`assertDistributionTree`/`assertCodexTree` removed from
  `build.ts`; `verify.ts`'s local `validatePluginTreeShape` removed and its Codex checks
  partially folded (safe, non-entangled subset only — 2 documented deviations from the plan's
  literal wording, see milestone-2.md). Review-fix loop (1 iteration): 3-agent swarm found
  3 MEDIUM findings (V-DRY-03 marker duplication, V-DRY-02 predicate duplication, V-KISS-01
  untested substring-partition contract) — all fixed via TDD (`INSTRUCTIONS_MARKER` constant,
  `hasInstructionsBlock` predicate, 3 coupling-contract tests). `bun test` 180/180 pass,
  `bun run verify` 18/18 pass (with `VERIFY_SKIP_BUILD=1`), byte-for-byte identical output
  across the full compiled tree, re-confirmed after the fix round. Ready to commit.

## Failed Approaches

(none)

## Dismissed Clarifications

- Source: `documentation/milestones/_active/blackhole-scoped-extraction/milestone-1.md` (2 markers) — both concern out-of-milestone future scope. Dismissed per user confirmation.

## Next Steps

1. Commit Milestone 2 on `blackhole/milestone-1-identity-ssot` (same branch/PR as M1)
2. Milestone 3 — Governance & Cleanup, per `documentation/milestones/_active/blackhole-scoped-extraction/milestone-3.md` (same branch/PR)
3. Update PR #90's description once all 3 milestones are committed

## Known Limitations

- Out of scope per plan: 3 hidden `spawnSync('bun run build')` channels in `verify.ts`; `author` block in `buildCodexPluginManifest`; `owner.name` in `marketplaceJson`.
- **Confirmed three times now**: `scripts/build.ts`'s `cleanDir(path.join(root, '.claude'))` deletes the *entire* `.claude/` directory recursively — including `.claude/initiatives/` and `.claude/progress.md`, which are NOT build output. Both `bun run build` directly AND `bun run verify` (which internally shells out to `bun run build` via one of `verify.ts`'s 3 hidden `spawnSync` calls — exactly the coupling channel the architectural retrospective flagged as out-of-scope-but-real) wiped these files 3 times this session; each time reconstructed from session context/a manual backup. This is a real, reproducible bug worth filing as a follow-up issue: scope `cleanDir` to only the subdirs `build.ts` actually owns inside `.claude/` (`agents/`, `rules/`, `skills/`), never the whole directory. Workaround for future sessions: back up `.claude/initiatives/` and `.claude/progress.md` before any `bun run build`/`bun run verify` call, restore after.
- **Environment issue**: `x-tester` agent invocation fails in this session with `WorktreeCreate hook failed: hook succeeded but returned no worktree path` — a broken hook, not a code issue. Quality gates were run directly via Bash instead.
