---
name: release-process
description: >
  Use when cutting or shipping a Thumbscope release, or doing the post-release sync - i.e. the user
  says "release 1.1.0", "cut a release", "ship a version", "tag a release", "publish the build", "do
  a hotfix", "bump the version", or asks how the release/changelog/tagging flow works. Drives the
  GitFlow release process mapped onto this repo's tag-triggered CI: release branch → version bump +
  CHANGELOG → PR to main → merge → tag → publish the draft GitHub Release (win + mac artifacts) →
  merge main back to develop. Covers the hotfix variant too.
argument-hint: "target version, e.g. 1.1.0 (or 'hotfix 1.1.1')"
---

# Thumbscope Release Process

GitFlow + this repo's CI. **Publishing is triggered by pushing a `v*` tag** - `.github/workflows/release.yml` then builds Windows + macOS (unsigned) and uploads them to a pre-created **draft** GitHub Release. The draft → published step is manual.

This is a fragile, partly irreversible sequence (tags, merges, a public release). **Confirm with the user before the tag push and before each merge.** Don't run `git tag`/`git push`/`gh release`/merge steps without an explicit go-ahead.

## Versioning

Semver from the change set since the last release: new feature → **minor** (`1.0.0 → 1.1.0`), bug-fix only → **patch**, breaking → **major**. The macOS-support release is `1.1.0`.

## Standard release

Prereq: all intended feature/fix PRs already merged into `develop`, and `develop` is green.

1. **Branch off develop:**
   ```bash
   git switch develop && git pull --ff-only
   git switch -c release/<version>
   ```
2. **Bump the version** (syncs `package.json` + `package-lock.json`, no tag yet):
   ```bash
   npm version <version> --no-git-tag-version
   ```
   The version drives the artifact names (`thumbscope-<version>-arm64.dmg`, the Windows `…-setup.exe`), the app `--version`, and the NSIS upgrade-detect registry - so it must be bumped before tagging.
3. **Update `CHANGELOG.md`** - rename the existing `## [Unreleased]` heading to `## [<version>] - <YYYY-MM-DD>` (its accumulated entries become the release notes; convert relative dates to absolute), then open a fresh empty `## [Unreleased]` above it. Update the link refs at the bottom: point `[Unreleased]` at `compare/v<version>...develop` and add a `[<version>]` tag link. If `[Unreleased]` is empty at cut time, backfill it from `git log v<prev>..develop` (user-facing changes only).
4. **Commit** (DCO sign-off + the repo's public identity - see Gotchas):
   ```bash
   git commit -s -m "chore(release): <version>"
   ```
5. **PR `release/<version>` → `main`** with the CHANGELOG section as the body. Use the **`create-pull-request`** skill for the body. `ci.yml` runs on the PR (typecheck + tests). Review.
6. **Merge to `main`** (`--no-ff` keeps the GitFlow merge commit). Confirm first.
7. **Tag on `main` → this publishes:**
   ```bash
   git switch main && git pull --ff-only
   git tag -a v<version> -m "v<version>"
   git push origin v<version>
   ```
   Fires `release.yml`: a `draft` job creates the draft release `v<version>`, then the `build` matrix builds win + mac unsigned (`--publish never`) and explicitly uploads **only** the two installers (`*-setup.exe`, `*-arm64.dmg`) to the draft - no `latest*.yml`, blockmaps, or mac `.zip`.
8. **Finalize the GitHub Release** (manual, by design): open the draft in **Releases**, confirm its assets are **exactly** `*-setup.exe` + `*-arm64.dmg`, replace the placeholder notes with the body template (below), then click **Publish**.
9. **Sync back to develop:**
   ```bash
   git switch develop && git merge --no-ff main && git push
   ```
10. **Close any release-completing issues manually** (convention: no auto-close keywords). E.g. an issue whose last acceptance criterion was "tagged releases publish a macOS asset".

## Hotfix variant

Branch off `main` (not develop): `git switch main && git switch -c hotfix/<version>`. Bump patch version + CHANGELOG, PR → `main`, merge, tag `v<version>` (publishes), then **merge `main` back into `develop`** so the fix + bump aren't lost.

## Release body template (step 8)

A release body says **what changed in this version and where to get it** - it is not a README. Do **not** paste install steps; README §2 owns those. Structure:

```markdown
## Highlights            <- optional; include for a big release
<one or two lines>

## Changes               <- the full CHANGELOG [version] section, verbatim
### Added
- ...
### Changed
- ...
### Fixed
- ...

---
NOTE: builds are unsigned. On first run (details in [README → Installation](https://github.com/ivmakk/thumbscope#2-installation)):
* Windows: More info → Run anyway
* macOS: right-click → Open
```

- Paste the CHANGELOG `[<version>]` section verbatim into **Changes**; add **Highlights** only for a notable release.
- The **unsigned-open line stays** - it is the one non-obvious install fact (SmartScreen / Gatekeeper block the app without it). **When code-signing lands, drop that line.**
- Let GitHub append its auto **"Full Changelog: v<prev>...v<version>"** compare link below.

## Pre-tag smoke test (before step 7)

The tag push is the point of no easy return, so validate the actual clean-runner build first. `release.yml`'s **`workflow_dispatch`** builds win + mac with `--publish never` and uploads the installers as *run artifacts* (no release created).

1. On `release/<version>`, trigger the Release workflow via `workflow_dispatch` (Actions tab, or `gh workflow run release.yml --ref release/<version>`).
2. Download the run artifacts; install and click through on **both** Windows and macOS.
3. Only once green, proceed to step 7 (tag).

Caveat: `workflow_dispatch` exercises the *build* but **not** the `gh release upload` step - that path was proven once by the `v1.2.0-rc.1` rehearsal (see the release-1.2.0-prep ticket). After tagging, always re-check the draft's assets (step 8) before publishing. See **Gotchas** for the concurrency guard and the don't-re-push-a-tag rule.

## Gotchas

- **Tag → workflow + code is read from the tagged commit on `main`.** A feature must have reached `main` (develop → main) before its code/CI appears in a release. The first macOS release is the first tag cut after the macOS PR flows through.
- **Tag must match `v*`** (e.g. `v1.1.0`). The draft release title is the tag name.
- **Draft is pre-created in its own job + a `concurrency` guard serializes same-ref runs** - don't manually create a release for the same tag, and avoid re-pushing a tag mid-run (delete the draft first if you must re-run).
- **DCO + identity:** sign every commit (`-s`) and use the repo's public no-reply identity `ivmakk <ivmakk@users.noreply.github.com>` - never a real/work email (public repo). If a commit landed with the wrong identity, rewrite with `git rebase <base> --exec 'git -c user.name="ivmakk" -c user.email="ivmakk@users.noreply.github.com" commit --amend --no-edit --reset-author --signoff'` then `git push --force-with-lease`.
- **`workflow_dispatch`** (manual build-only, artifacts no publish) is only selectable once `release.yml` is on the **default branch (`main`)**. After that it works for any branch.
- **Don't bump version on develop directly** - it belongs on the release branch so the bump flows main→develop via the sync merge.
- **`npm version` also writes a git tag by default** - always pass `--no-git-tag-version`; the real tag is created on `main` in step 7, not on the release branch.
