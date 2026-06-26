---
name: create-pull-request
description: >
  Use for ANY GitHub Pull Request creation in the Thumbscope repo. BLOCKING: invoke before
  `gh pr create` — never assemble a PR body inline or in a temp file without this skill's
  template. Activates on "create a PR", "open a pull request", "push and PR", and any chained
  command ending in PR creation (e.g. "commit, push, then open a PR"), or when the user names a
  ticket and asks to submit/ship/hand off the work. Produces the description, related-issue link,
  type-of-change, testing, and checklist via the gh CLI; keeps real local paths and PII out
  (public repo).
argument-hint: "issue number or short description of the change"
---

# Create Pull Request (Thumbscope)

> **BLOCKING REQUIREMENT.** If your next action is `gh pr create` — or you are about to invite the
> user to run it — stop and follow this skill end-to-end. Do not draft a PR body in chat, in a
> HEREDOC, or in `/tmp/*.md` without first using the template below. The repo ships
> `.github/pull_request_template.md`; this skill is how you fill it correctly.

This skill is the GitHub-issue counterpart to a Jira-tied PR flow: link the **GitHub issue** (not a
tracker), use the project's `Refs #N` + manual-close convention, and respect the public-repo privacy
gate. For issue *body* formatting (feature/bug structure, title prefixes, forms), defer to the
**`ticket-formatting`** skill — don't duplicate it here.

## Procedure

### 1. Collect context

1. **Issue number** — from the branch name (`feat/<N>-<slug>`, bare number) or ask. Map it to the issue with `gh issue view <N> --repo ivmakk/thumbscope --json number,title`.
2. **Local ticket** — `docs/local/tickets/<NNN>-*.md` (gitignored; may hold real paths). Read its Summary, Scope, and the implementation plan / validation evidence to write the Description and Testing sections. **Never copy the local file's real paths, effort tiers, or `Phase N` labels into the PR** — synthesize self-contained prose.
3. **Diff summary** — `git --no-pager diff origin/develop...HEAD --stat` to see what changed.

### 2. Determine target branch

- Default base: **`develop`**.
- Release/hotfix branches target `main` — ask if the branch name doesn't make the target obvious.

### 3. Write the PR description

Start from `.github/pull_request_template.md` and populate every section. Remove the **Related issue** block only when there is genuinely no related issue.

```markdown
## Description

<What this PR does and why, 1–3 sentences. Synthesize from the issue/ticket; don't paste verbatim.>

## Related issue

[<exact issue title> (#N)](https://github.com/ivmakk/thumbscope/issues/N)

## Type of change

<the one that applies — Feature / Bug fix / Breaking change / Docs · chore · CI / Release>
<!-- single plain-text line, NOT checkboxes — checkboxes inflate GitHub's PR task counter and a one-of-N select always reads as partial progress -->


## How has this been tested?

<Steps a reviewer runs + expected result. Name automated tests (`npm test`, `npm run typecheck`)
and any manual GUI/CLI checks. For packaging changes, say what was built/run.>

## Checklist

- [x] Self-reviewed the diff
- [x] `npm test` and `npm run typecheck` pass
- [x] Docs updated (README / CLAUDE.md / DESIGN.md) where relevant
- [x] No real local paths or PII in tracked files (public repo)
```

**Related issue** — put it right under Description (like a tracker link): the issue's **full title** plus `(#N)`, all as the link text pointing at the issue URL, e.g. `[\[Feature\] macOS support (#1)](https://github.com/ivmakk/thumbscope/issues/1)`. **Escape any brackets in the title** (`\[Feature\]`) — unescaped `[...]` breaks the markdown link. This records a cross-reference on the issue **without closing it**, so no separate `Refs #N` line is needed in the PR body (it would just duplicate the link). Use this only when the PR maps directly to one issue; for several, list each on its own line. Don't use closing keywords (`Closes/Fixes/Resolves`) — issues are closed manually. The **commit footer** still carries `Refs #N` (CLAUDE.md convention).

### 4. Open the PR

```bash
GH_PAGER=cat gh pr create \
  --base develop \
  --title "<conventional-commit subject>" \
  --body-file /tmp/pr_body.md
```

- **Title**: the conventional-commit subject (e.g. `feat: macOS (arm64) build support`) — no leading `#N`.
- Push the branch first if it has no upstream: `git push -u origin HEAD`.
- Draft: add `--draft`. Report the PR URL after creation.

## Conventions (Thumbscope)

- **Issue linkage** (CLAUDE.md): branch `feat/<N>-<slug>` (bare number). Use **`Refs #<N>`** in the PR body — **not** closing keywords (`Closes/Fixes/Resolves`); issues are closed manually after merge.
- **Public repo**: no real local filesystem paths, IPs, or personal data in the PR title/body. Abstract corpus/sample details; the local ticket is where real paths live (gitignored).
- **Bug PRs**: when relevant, state the **file variant** (A / B / C / ehthumbs / ivThumbs flat / ivThumbs nested / recovered) the fix targets — see the format taxonomy in `CLAUDE.md`.
- **Testing section is mandatory** — for logic, name the tests; for packaging/CI, say what was built and run (e.g. "CI build green on `macos-latest`; dmg installed + GUI verified").

## Gotchas

- **Base `develop`, not `main`** — except release/hotfix.
- **Use `--body-file`** for the body (multi-line markdown + code fences survive); re-read it for real paths / PII before `gh pr create`.
- **Run `gh` non-interactive** in agent sessions (`GH_PAGER=cat`); avoid pagers/prompts that hang.
- **Branch must be pushed** before `gh pr create`.
- **Don't commit/push without explicit user instruction** — creating the PR is fine once the branch is pushed, but `git add/commit/push` needs the user's go-ahead (CLAUDE.md: the user commits manually).
- **Issues and PRs share one number sequence** — issue `#1` and the next PR is `#2`; they don't collide but also aren't the same entity. Link the issue explicitly.
