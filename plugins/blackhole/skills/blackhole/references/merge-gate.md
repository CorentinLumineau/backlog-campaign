# Merge Gate — Eligibility, Cycle Detection, Drift Reconciliation

Owns the entire merge-eligibility algorithm (ADR-005): whether an LGTM'd issue's PR
may actually be merged this turn. No merge mechanics live here — HEAD/CI/build
checks and the `gh pr merge` call itself stay in `phase-loop.md` § Merge protocol;
this doc is consulted from that step as a single delegated precondition
(`LGTM AND mergeEligible(issue)`), never inlined.

Consumes `queue.json`'s `merge_hold` / `merge_after` fields (see `queue-dag.md`
Field rules) and `config.json`'s `merge_mode` field (see `config-template.md`).
Reuses `scripts/forge-scope.ts` (`readScope`, `issueMatchesScope`) for gated-batch
scope — does not reimplement it (V-INT-02).

## 1. `mergeEligible(issue) -> bool`

```
function mergeEligible(issue, queue, config):
    # Condition 1 — explicit hold
    if issue.merge_hold == true:
        return false

    # Condition 2 — unresolved merge-order predecessors
    for dep_number in issue.merge_after:
        dep = queue.issues[dep_number]
        if dep.status not in ["merged", "closed"]:
            return false

    # Condition 3 — gated-batch sibling wait (only when merge_mode: gated-batch)
    if config.merge_mode == "gated-batch":
        scope = readScope(config)                       # scripts/forge-scope.ts
        siblings = [i for i in queue.issues.values()
                    if issueMatchesScope(i, scope)]       # scripts/forge-scope.ts
        if not all(isLgtm(s) for s in siblings):
            return false

    return true
```

Evaluate the three conditions **in this order** and **short-circuit** on the first
`false` — cheap local reads first (`merge_hold`, then `merge_after` against
already-synced `queue.json` state), the scope-wide gated-batch scan last (only
needed when the field-level checks already pass). Evaluation order does not
change the result: any single failing condition makes the issue ineligible
regardless of which one is checked first (see Edge Cases § Hold + unresolved
`merge_after` below).

`isLgtm(issue)` is `review-core.md` § LGTM definition, unchanged — gated-batch
does not define a second notion of "reviewed".

### Condition 1 — `merge_hold`

Pure boolean read. `true` unconditionally blocks the merge regardless of LGTM
status, `merge_after`, or `merge_mode`. This is the direct "flag to not merge"
mechanism the ADR exists to add.

### Condition 2 — `merge_after` resolution

Each entry in `issue.merge_after` is an issue number. It is **satisfied** when
that issue's `queue.json` `status` is `merged` **or** `closed` — the identical
`merged OR closed` rule `depends_on` already uses (`queue-dag.md` Step 2, rule 2).
Closed-not-merged (wontfix/duplicate) still counts as resolved; this is the fix
for the predecessor-closed deadlock class. All entries must resolve; an empty
`merge_after` array (the default, `[]`) is vacuously satisfied — matches
`depends_on`'s empty-array semantics exactly.

### Condition 3 — gated-batch sibling wait

Only evaluated when `config.json.merge_mode == "gated-batch"` (default
`"immediate"` skips this condition entirely — the loop above never enters the
`if` body, so immediate-mode campaigns pay zero extra cost). "Siblings" means
every `queue.json` issue matching the campaign's configured scope
(`scope_milestone` / `scope_labels`), computed via `readScope(config)` +
`issueMatchesScope(issue, scope)` from `scripts/forge-scope.ts` — the same
scope mechanism `forge-sync.md` already uses for issue ingest/completion
counting. Do not build a second scope-matching mechanism; call these two
exported functions directly.

The condition is satisfied only when **every** in-scope issue satisfies
`isLgtm()`. A scope of exactly one in-scope issue makes this vacuously true
(nothing else to wait for) — gated-batch degrades to immediate-mode behavior
for a single-issue scope.

**Scope is re-evaluated every orchestrator turn**, not frozen when the batch
wait begins — the same design already used for wave computation
(`queue-dag.md` Step 4). An issue entering or leaving scope mid-wait (label
added/removed, milestone reassigned) is picked up naturally on the next
`mergeEligible` evaluation; there is no separate "batch snapshot" state to keep
in sync. This is documented explicitly here per ADR-005's Key Assumptions
"Oversimplified" marker — treat it as the intended design, not an omission.

## 2. Cross-graph cycle detection

Run at the forge-sync boundary, every orchestrator turn (fail-fast — never
discovered only when a merge is attempted). Build one directed graph from the
**union** of two edge sets read from `queue.json`:

- `depends_on` edges (issue → each entry in its `depends_on`)
- `merge_after` edges (issue → each entry in its `merge_after`)

Detect cycles with the same topological-sort technique `queue-dag.md` Step 4
already uses for wave computation (Kahn's algorithm or DFS with a recursion
stack) — do not add a second cycle-detection implementation; the two graphs
share detection logic even though `depends_on` and `merge_after` remain
distinct fields with distinct semantics (implementation-start gate vs.
merge-time gate).

On detecting a cycle involving issues `A` and `B` (self-referential — `A`
listing itself — is a degenerate 1-node cycle of the same class):

1. Set `status: blocked` on **both** `A` and `B` (all issues on the cycle, for
   cycles longer than 2).
2. Set each one's `notes` to `merge-order cycle with #N` (`N` = the other
   issue's number; for cycles >2 nodes, name the next node in the cycle).
3. Surface via the existing `AskQuestion` user gate (`coordinator.md` /
   `orchestrator.md`'s existing interactive-gate convention) — never silently
   deadlock or auto-resolve a cycle.

This step is consulted (by pointer) from `forge-sync.md`'s sync sequence — the
algorithm lives here once; `forge-sync.md` does not duplicate it inline.

## 3. Forge-drift reconciliation

Also run during forge-sync, every turn. For every issue where `merge_hold ==
true` **or** `merge_after` has at least one unresolved entry (Condition 1 or
Condition 2 above would currently return `false`), check whether its PR was
merged anyway, outside blackhole's control:

```
gh pr view <pr_number> --json state,mergedAt
```

If `state == "MERGED"` (`mergedAt` non-null) despite the hold/unresolved
predecessor, that is **drift**: the merge already happened and cannot be
undone. Reconcile `queue.json` to match forge reality (`status: merged`,
`phase: done` — same as any other externally-observed merge, per
`forge-sync.md` § Reconcile existing queue entries) and log `V-MERGE-02`
(WARN) to `findings-ledger.json`. This is audit-only: the ledger row records
that a hold was bypassed, it does not and cannot reverse the merge.

## 4. Gated-batch merge execution — one PR at a time

Once Condition 3 (§1) has been satisfied for all in-scope issues (every
sibling reached LGTM), the batch does **not** merge as a single atomic
multi-PR operation. Compute the merge order and execute sequentially:

1. Take the in-scope, now-all-LGTM issue set.
2. Topologically sort it on `merge_after` edges (same technique as § 2's
   cycle-detection graph, minus cycles since § 2 already guarantees none
   remain unresolved at this point).
3. For each issue in that order: re-check `mergeEligible(issue)` (a `merge_after`
   entry may resolve mid-batch as earlier PRs merge), then run the normal
   `phase-loop.md` § Merge protocol (`gh pr merge --squash`) for that one PR,
   then persist `queue.json` (`status: merged`, `refreshed_at` bump) **before**
   moving to the next issue in the order.

Persisting after each individual merge — rather than issuing every `gh pr
merge` call as one batch — is what turns a mid-batch failure into a resumable
state: the next orchestrator turn picks up `mergeEligible()` evaluation
exactly where it left off (predecessors already merged stay resolved), with
no rollback logic required for the PRs that already landed.

## Edge cases

| Scenario | Resolution |
|----------|------------|
| `merge_after: []` (default) | Condition 2 vacuously satisfied — matches `depends_on`'s empty-array semantics |
| `merge_after` entry has `status: closed` (not `merged`) | Satisfied — same `merged OR closed` rule as `depends_on` |
| Self-referential or mutual cycle (`A merge_after [B]`, `B merge_after [A]`), including cross-graph via `depends_on` | § 2 cycle detector flags both, sets `status: blocked` on each with note `merge-order cycle with #N`, surfaced via `AskQuestion` — never a silent deadlock |
| Gated-batch, exactly one in-scope issue | Condition 3's `all(...)` over a one-element set is vacuously true — identical behavior to immediate mode |
| `merge_hold: true` **and** an unresolved `merge_after` entry simultaneously | Either condition alone is sufficient to block; §1 short-circuits on Condition 1, so Condition 2 is never even evaluated — but the result is the same either way (see §1's ordering note) |
| PR merged externally while `merge_hold: true` (or `merge_after` unresolved) | § 3 detects via `gh pr view --json state,mergedAt` on the next forge-sync; logs `V-MERGE-02` WARN — audit only, the merge cannot be undone |

## Consulted by

- `phase-loop.md` § Merge protocol — `LGTM AND mergeEligible(issue)` precondition before `gh pr merge`.
- `forge-sync.md` — cycle detection (§ 2) and drift reconciliation (§ 3), run every turn at the sync boundary.
- `orchestrator.md` Phase 5 — pointer reference only, no inline logic.

None of these three files duplicate the algorithm above inline — they cite this
doc by pointer (`` Per `merge-gate.md` § N `` style, matching the existing
`orchestrator.md`/`queue-dag.md` citation convention) and call `mergeEligible()`
as a black box.
<!-- GENERATED by scripts/build.ts from src/references/merge-gate.md — do not hand-edit -->
