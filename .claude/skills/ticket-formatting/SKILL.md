---
name: ticket-formatting
description: >
  Use when writing, reviewing, or drafting Thumbscope GitHub Issues - feature requests and bug
  reports - or the issue-form templates under .github/ISSUE_TEMPLATE/. Activates when formatting an
  issue body, building or editing a YAML issue form, checking acceptance-criteria quality, or filing
  via the gh CLI. Enforces community-standard structure (typed title prefixes, problem→solution→
  alternatives features, structured bug reports), outcome-based acceptance criteria, and - because the
  repo is public - zero real local paths or personal data.
argument-hint: "feature | bug | issue number to draft or review"
---

# Thumbscope Issue Formatting

GitHub Issues are the public, contributor-facing surface (`https://github.com/ivmakk/thumbscope/issues`). An issue states **what** the request is and **how to verify it's done** - short, user-facing, readable cold. Implementation depth (the *how*) belongs in the PR, not the issue.

This skill follows the de-facto community conventions popularized by GitHub's Issue Forms and collections like [stevemao/github-issue-templates](https://github.com/stevemao/github-issue-templates) and [devspace/awesome-github-templates](https://github.com/devspace/awesome-github-templates).

## Public repo - avoid sharing PII

The repo is public. Don't post PII or machine-identifying detail in an issue, comment, or template - real filesystem paths, personal names, IP addresses, or pointers to the private corpus. Abstract when needed (e.g. "a 109-thumbnail IrfanView flat sample", not a path); once posted it's cached/indexed even if deleted.

## Issue conventions

1. **Typed title prefix**: `[Feature] macOS support`, `[Bug] Crash on truncated ehthumbs.db`, `[Docs] …`, `[Chore] …`. One line, specific.
2. **GitHub-flavored Markdown** - `##` headings, `-` bullets, `- [ ]` task lists, fenced code blocks with language tags all render natively.
3. **Task lists encouraged** for scope / acceptance - render as progress checkboxes on the issue and project boards.
4. **Linkable entities** - GitHub auto-links within the repo; use them:
   - Issues / PRs: `#12`.
   - Commits: short SHA `1d8d192` auto-links; in prose, full link to `https://github.com/ivmakk/thumbscope/commit/<sha>`.
   - Files / lines: `[src/main/index.ts:239](https://github.com/ivmakk/thumbscope/blob/main/src/main/index.ts#L239)`.
5. **Labels**: `enhancement`, `bug`, `documentation`, `chore` (maintenance/assets/tooling, pairs with the `[Chore]` prefix), `good first issue`, platform labels (`platform:macos`, `platform:windows`).
6. Body starts directly with the summary - no "Description:" label.

## Feature issue - community structure

Problem → solution → alternatives. Short and user-facing. No implementation phases, effort tiers, or file paths.

```markdown
## Problem / motivation
What are you trying to do that's hard or impossible today? Who's blocked without this.

## Proposed solution
What should happen.

## Alternatives considered
Other approaches and why they fall short. (optional)

## Platform
Windows / macOS / Linux / All

## Acceptance
- [ ] Observable, testable criterion
- [ ] Observable, testable criterion
```

## Bug issue - community structure

```markdown
## What happens
## Expected
## Steps to reproduce
1. …

## Environment
- OS + version
- Thumbscope version
- File variant: catalog-jpeg / catalog-jpeg-guid / hashed-jpeg / abbrev-jpeg / catalog-dib / irfanview-flat / irfanview-nested / recovered

## Notes (optional)
Root cause / fix direction only if part of the bug definition (helps a contributor reproduce).
```

The **File variant** line maps to the format taxonomy in `CLAUDE.md` - it's the fastest triage signal; always ask reporters for it.

## Issue forms (preferred over markdown templates)

For `.github/ISSUE_TEMPLATE/*.yml`, GitHub Issue Forms beat plain markdown templates: required fields, dropdowns, and auto-applied labels prevent half-filled reports. Use forms when generating templates for the repo.

Key form mechanics:
- `title: "[Feature] "` pre-fills the typed prefix; the user appends.
- `labels: ["enhancement"]` auto-applies on submit.
- `type: dropdown` for Platform (feature) and File variant (bug) - make them `required: true` so triage signal is never missing.
- `type: checkboxes` with a required "I searched existing issues for duplicates" gate.
- Add `.github/ISSUE_TEMPLATE/config.yml` to control the blank-issue toggle and contact links.

Feature form skeleton:

```yaml
name: Feature request
description: Suggest a feature or improvement for Thumbscope
title: "[Feature] "
labels: ["enhancement"]
body:
  - type: textarea
    id: problem
    attributes:
      label: Problem / motivation
    validations: { required: true }
  - type: textarea
    id: proposal
    attributes:
      label: Proposed solution
    validations: { required: true }
  - type: textarea
    id: alternatives
    attributes: { label: Alternatives considered }
  - type: dropdown
    id: platform
    attributes:
      label: Platform
      options: [Windows, macOS, Linux, All / cross-platform]
    validations: { required: true }
  - type: checkboxes
    id: checks
    attributes:
      label: Pre-submit
      options:
        - label: I searched existing issues for duplicates
          required: true
```

Bug form adds a required `File variant` dropdown (catalog-jpeg / catalog-jpeg-guid / hashed-jpeg / abbrev-jpeg / catalog-dib / irfanview-flat / irfanview-nested / recovered) and OS + version inputs.

## Acceptance criteria quality

Good ACs are:
- **Testable** - pass/fail with no ambiguity.
- **Outcome-focused** - describe *what*, not *how*.
- **Scoped** - one condition per bullet.

Avoid:
- Vague: "it should work correctly".
- Implementation steps: "add a `mac` block to electron-builder.yml" (the *how* - belongs in the PR).
- Multi-condition bullets: "builds and runs and exports and CLI works".

## gh CLI

```bash
# create from a body file (write sanitized markdown to a temp file first)
gh issue create --repo ivmakk/thumbscope --title "[Feature] macOS support" --label enhancement --body-file /tmp/issue.md

# edit
gh issue edit <N> --repo ivmakk/thumbscope --body-file /tmp/issue.md

# list / view
gh issue list --repo ivmakk/thumbscope
gh issue view <N> --repo ivmakk/thumbscope
```

Write the body to a temp file (not inline `--body`) so multi-line markdown and code fences survive. Re-read it for real paths / personal data before running `gh issue create`.
