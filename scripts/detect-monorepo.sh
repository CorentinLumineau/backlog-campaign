#!/usr/bin/env bash
# detect-monorepo.sh — Detect monorepo structure at campaign invocation time.
#
# Contract:
#   - Fast: exits in < 500ms
#   - Read-only: no writes, no env mutations
#   - No network: no curl, wget, or remote calls
#   - Exits 0: always (failures print and exit 0)
#   - Self-contained: no user interaction, no stdin
#
# Output format:
#   monorepo=yes|no                    (always emitted)
#   packages=<comma-separated-paths>   (only when monorepo=yes AND packages discoverable)
#
# SSOT for the workspace-config and package-discovery signals: this file's
# detection steps below — do not restate the signal list elsewhere in this
# repo or in agent prompts.

set -u

emit_no() { echo "monorepo=no"; exit 0; }

# 1. Workspace config files (any one -> monorepo=yes)
for cfg in pnpm-workspace.yaml lerna.json nx.json go.work; do
    if [[ -f "$cfg" ]]; then
        echo "monorepo=yes"
        # Best-effort package list extraction
        case "$cfg" in
            pnpm-workspace.yaml|lerna.json|nx.json)
                # Glob fallback for actual package dirs
                pkgs=$(find apps packages services -maxdepth 2 \( -name package.json -o -name go.mod \) 2>/dev/null | sed 's|/[^/]*$||' | sort -u | paste -sd, -)
                ;;
            go.work)
                pkgs=$(awk '
                    /^[[:space:]]*use[[:space:]]*\(/ { in_block=1; next }
                    in_block && /^[[:space:]]*\)/    { in_block=0; next }
                    in_block { gsub(/^[[:space:]]+|[[:space:]]+$/, ""); if ($0 != "") print }
                    !in_block && /^[[:space:]]*use[[:space:]]+[^(]/ { gsub(/^[[:space:]]*use[[:space:]]+/, ""); if ($0 != "") print }
                ' "$cfg" 2>/dev/null | sed 's|^\./||' | paste -sd, -)
                ;;
        esac
        [[ -n "${pkgs:-}" ]] && echo "packages=$pkgs"
        exit 0
    fi
done

# 2. Fallback: >=2 directories under packages/*/, apps/*/, or services/*/ each with package.json or go.mod
pkgs=$(find apps packages services -maxdepth 2 \( -name package.json -o -name go.mod \) 2>/dev/null | sed 's|/[^/]*$||' | sort -u)
count=0
[[ -n "$pkgs" ]] && count=$(printf '%s\n' "$pkgs" | wc -l | tr -d ' ')
if [[ "${count:-0}" -ge 2 ]]; then
    echo "monorepo=yes"
    echo "packages=$(echo "$pkgs" | paste -sd, -)"
    exit 0
fi

emit_no
