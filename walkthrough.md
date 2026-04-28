# Visual Unification Walkthrough

This document tracks the cross-page visual unification work for `Docker`, `SSH`, and `Git Config`.

## What was added

- A shared design-system layer in `apps/desktop/src/renderer/src/theme/global.css`:
  - `.hp-card`
  - `.hp-btn`, `.hp-btn-primary`, `.hp-btn-danger`
  - `.hp-input`
  - `.hp-status-alert` (+ `success`, `warning`, `error`)

## Where it is used

- `apps/desktop/src/renderer/src/pages/DockerPage.tsx`
  - Unified cards/buttons/inputs and cleanup preview blocks
  - Standardized status messaging and action controls
- `apps/desktop/src/renderer/src/pages/SshPage.tsx`
  - Unified wizard-like identity cards and primary actions
  - Standardized status alert treatment for setup/test operations
- `apps/desktop/src/renderer/src/pages/GitConfigPage.tsx`
  - Unified form cards, button variants, and status alerts
  - Consistent control styling for filter/sort/masking tools

## UX outcomes

- Buttons, cards, and inputs now share one visual language across Phase 2/3/4 surfaces.
- Success/warning/error feedback follows a consistent status-alert system.
- Future UI changes can be done in one place (`global.css`) instead of per-page style rewrites.

## Verification

- `npx pnpm --filter desktop typecheck`
- `npx pnpm lint`

Both pass after this unification pass.
