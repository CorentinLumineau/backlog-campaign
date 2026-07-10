# Phase 5 — Loop

## Checklist

```
- [ ] Auto forge sync (native — no user prompt)
- [ ] BLOCK/WARN unresolved? → phase implement (same issue)
- [ ] LGTM AND mergeEligible(issue)? → merge PR (runbook quality gates)
- [ ] queue.json: status merged, phase done
- [ ] Resolve/defer ledger entries for this issue/PR
- [ ] forge-sync.md protocol
- [ ] Compute ready set (queue-dag.md)
- [ ] Persist queue.json → findings-ledger.json → campaign-checkpoint.md when in-flight work exists (checkpoint-protocol.md)
- [ ] Spawn parallel batch (up to parallel_max) — one turn, end turn
- [ ] Open issues + open PRs both zero? → campaign complete
```

## Merge protocol

**Trigger, per `config.json.merge_mode`** (checklist line "LGTM AND
`mergeEligible(issue)`? → merge PR"):
- `"immediate"` (default): apply steps 0-5 below to each LGTM'd issue
  individually, as encountered.
- `"gated-batch"`: do **not** apply steps 0-5 issue-by-issue as encountered.
  Instead, once `merge-gate.md` § 1 Condition 3 is satisfied for the whole
  in-scope set (every sibling LGTM'd), run `merge-gate.md` § 4's sequential
  batch procedure — it internally invokes steps 0-5 below, once per issue, in
  topological `merge_after` order, persisting `queue.json` after each. Do not
  duplicate § 4's ordering/persistence logic here; this section owns only the
  per-PR merge mechanics § 4 calls into.
- `"leave-open"` (ADR-006): do **not** apply steps 0-5 to these issues at
  all — no `mergeEligible(issue)` call, no `gh pr merge` (see `merge-gate.md`'s
  bypass note). Once `review-core.md`'s `isLgtm(issue)` is true, treat the
  issue as delivered for campaign-complete purposes only: annotate
  `queue.json`'s `notes` field (not `status`/`phase`) — e.g.
  `"delivered-at-LGTM (leave-open) — awaiting human merge"` — and leave the PR
  open. The actual external merge is picked up later by the normal
  forge-sync externally-observed-merge reconciliation path (unchanged,
  generic — no new logic needed here beyond citing it; see `merge-gate.md` §
  3).

0. Evaluate `merge-gate.md` § 1 `mergeEligible(issue)`. If `false`, **STOP** —
   do not proceed to step 1 for this issue (leave it `in-flight`; re-evaluated
   next turn). This step is binding wherever this section is cited or
   delegated — never skip it to reach step 1 directly.
1. `gh pr view <n> --json headRefOid` equals local HEAD
2. CI-wait: a detached background poll, never a foreground agent sleep. `gh pr
   checks <n>` must reach green (except Vercel preview — expected fail), but
   the orchestrator does not block the turn on it synchronously
   (`V-PARETO-01` — no LLM turn sleeping >10 min in a foreground poll loop).
   Spawn the check as a background-executed command per harness — Bash
   `run_in_background: true` + notification (Claude Code), background `Task`
   + `Await` on the task id (Cursor), or the equivalent detached-poll
   primitive on other harnesses — and use the same **Background worker
   barrier** idiom already documented in `orchestrator.md` (§ Background
   worker barrier) to resume steps 3-5 once the CI-green signal lands,
   instead of ending the turn and chat-polling. Poll interval/cap are
   specified in `merge-gate.md` § 0 (this section owns only the mechanics
   below, not the contract numbers).
   1. **`cancelled` conclusion with no real error**: if `gh pr checks <n>`
      (or `get_failing_step_logs`/`gh run view --log-failed`) shows a run
      concluding `cancelled` with no corresponding failing-step error, run
      `gh run rerun <run-id>` once (`&&`-chained per this file's existing gh
      convention) and resume the poll.
   2. **"Base branch was modified"**: if `gh pr checks <n>` /
      `mergeStateStatus` reports the PR's base was modified mid-watch,
      re-fetch `target_branch` and retry the check once.
   3. **2-retry cap**: if either rule's single retry does not resolve to a
      clean green/red CI result, reclassify per `orchestrator.md` § Error
      Classification (Transient → Permanent path) — do not restate that
      table here.
3. Run the project's build command in main clone (if applicable)
4. `gh pr merge --squash` (use `&&` only, never `;`) — immediately after this
   command succeeds, in the **same** atomic `queue.json` write that sets
   `status: merged`, also set `merged_by: blackhole` on the issue (ADR-005 —
   see `merge-gate.md` § 3 for why: this is the sole signal `V-MERGE-01`/
   `V-MERGE-02` attribution relies on; `status: in-flight` alone does not
   indicate blackhole itself performed the merge and must not be used for
   attribution).
5. Post-merge: migration apply if schema PR; deploy verify per runbook

## Ledger cleanup on merge

For issue N, PR P:

- Reset `review_iteration` to 0 on merge
- `fixed-in-pr` → `resolved`, `resolved_at` set
- `open` BLOCK on merged files → file new issue or `resolved` if obsolete
- `deferred` → keep until deferred issue merges
- Under `merge_mode: leave-open`, `fixed-in-pr` rows stay `fixed-in-pr` (not
  `resolved`) until the later forge-sync observes the real external merge —
  do not resolve them prematurely at LGTM time.

## Next batch

1. Run forge sync
2. Build ready set per `queue-dag.md` and **sort in descending order** of their Pareto Priority score.
3. For each selected issue, set `in-flight`, spawn worker at correct phase:
   - New issues start at **handle** or **plan** if handle complete
   - Returned-from-review start at **implement**

## Continuous Discovery of Improvements (Backlog Growth)
 
- The orchestrator triages all discoveries logged in the findings ledger.
- For every codebase improvement suggestion:
  1. Calculate the Priority score: $\text{Priority} = \text{Gain} \times (11 - \text{Effort})$.
  2. If $\text{Priority} \ge 30$:
     - If not yet filed, execute `gh issue create --title "[Discovery] <Name>" --body "..." $(bun scripts/forge-scope.ts create-args)` (explain context, gain, effort, and priority score).
     - Map the ledger's `deferred_to_issue` field to the new issue ID.
     - The next auto-sync step reconciles the new issue into `queue.json` as a new campaign backlog item.
  3. If $\text{Priority} < 30$:
     - Set status in findings ledger to `archived` (marked as low-value). Do not file a GitHub issue to keep the backlog clean and noise-free.
 
## Campaign complete
 
```
gh issue list --state open $(bun scripts/forge-scope.ts list-args) → []
gh pr list --state open → [] (excluding LGTM'd `leave-open` PRs, which count as delivered)
queue.json: no in-flight entries
```
 
Report to user: SHIPPED summary, LEDGER OPEN count, any deferred issues filed.
Then ask, via the coordinator's `AskQuestion` convention: "Start a new
campaign?"

- **Yes** — the coordinator re-fires the Campaign Launch Configuration Gate
  (`coordinator.md` § Bootstrap preflight, ADR-005) before its next
  orchestrator spawn, so the user reconfigures scope and `merge_mode` for the
  new campaign.
- **No** — the session ends normally; no further prompting.
<!-- GENERATED by scripts/build.ts from src/references/phase-loop.md — do not hand-edit -->
