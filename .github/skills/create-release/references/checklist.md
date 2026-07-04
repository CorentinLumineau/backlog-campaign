# Release checklist

## Before prepare

- [ ] `main` is up to date
- [ ] `bun run build` passes
- [ ] Semver bump agreed with user

## Notes file

- [ ] `.github/releases/vX.Y.Z.md` exists
- [ ] **v0.1.0 only:** full product overview (goal, flow, agents, install)
- [ ] **v0.2.0+:** diff-focused — only "What's new" section with changes since previous tag
- [ ] No references to external projects
- [ ] Links to v0.1.0 + README for full overview (minor/patch releases)

## Mechanical

- [ ] `package.json` version matches tag (without `v`)
- [ ] `bun run release validate vX.Y.Z` passes
- [ ] Committed on `main` and pushed
- [ ] `bun run release tag vX.Y.Z`
- [ ] `bun run release push vX.Y.Z`

## After CI

- [ ] `gh release view vX.Y.Z` — body matches notes file
- [ ] Release title reasonable
