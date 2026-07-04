# Campaign Config Template

Committed template: `.backlog-campaign/config.json`

```json
{
  "repo": "owner/repo-name",
  "target_branch": "main",
  "forge": "github",
  "parallel_max": 4,
  "scratchpad_dir": "/tmp/campaign",
  "size_label_prefix": "size:",
  "default_touch_paths": ["src/**", "lib/**", "app/**"],
  "issue_labels": {
    "campaign": "campaign/backlog"
  },
  "auto_sync": true,
  "entry_mode": "multitask"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `repo` | yes | `owner/name` for `gh` |
| `target_branch` | yes | Merge target (usually `main`) |
| `forge` | yes | `github` (only supported v1) |
| `parallel_max` | no | Max parallel workers (default 4) |
| `scratchpad_dir` | no | Parent dir for git worktrees |
| `size_label_prefix` | no | Label prefix for size tags (default `size:`) |
| `default_touch_paths` | no | Glob patterns for default scope boundary |
| `auto_sync` | no | When `true` (default), forge reconcile runs automatically |
| `entry_mode` | no | `multitask` (default) — coordinator + orchestrator; `direct` = legacy single session |

On first bootstrap, copy template to runtime if missing fields — do not
overwrite existing runtime config without user confirmation.

