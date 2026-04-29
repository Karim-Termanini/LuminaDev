# Commit Quality Rules

This file defines mandatory commit hygiene for this repository.

## Rules

1. One commit = one coherent intent (feature, fix, refactor, or docs update).
2. No micro-churn commits that can be folded into the parent change.
3. Commit message must explain scope and purpose, not a vague label.
4. No direct commits to `main`; all changes go through PR review.
5. If a change affects contracts or behavior, include/update tests in the same PR.

## Message guideline

Preferred format:
- `<type>: <concise scope>`

Where type is one of:
- `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

Examples:
- `fix: normalize docker cleanup error contracts`
- `test: add runtime uninstall preview schema coverage`
- `docs: add privilege boundary verification matrix`

## Reviewer checklist (commit-level)

- Is each commit independently understandable?
- Are unrelated formatting/cleanup changes avoided?
- Can commit order be read as a coherent story?

If not, request squashing/reorganization before merge.
