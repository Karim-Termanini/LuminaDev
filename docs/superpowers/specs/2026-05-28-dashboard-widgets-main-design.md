# Spec: Dashboard-Main — Widget Deck as Primary View

**Date:** 2026-05-28
**Status:** Approved

---

## Problem

`DashboardWidgetDeck` is rendered inside the active profile's expanded accordion card, gated behind `activeProfile === selectedProfileName`. Users who don't have the card open never see the widget grid. The dashboard grid should be the primary visible surface — persistent, not buried in a details section.

---

## Design

### Layout Restructure — `DashboardMainPage.tsx`

Split the dashboard into two vertical sections:

**Section 1 — Widget Hero (always visible, full width):**
- Renders `DashboardWidgetDeck` unconditionally, driven by `profileLayout` from the active profile's store entry.
- Empty state: when `profileLayout.placements` is empty, show a hero card: "No widgets yet — [Add Widgets →]" that navigates to `/dashboard/widgets`.
- Height: flexible, min 180px.

**Section 2 — Profile Cards Grid (below):**
- The 9 preset + custom profile cards remain as-is.
- The expanded profile card no longer contains the `DashboardWidgetDeck` — it only shows compose controls, Git status, editor launch, project path, running jobs.
- The `allWidgets` section inside the expanded card is removed.

### Layout Load

`profileLayout` is already loaded on mount via `dh:layout:get`. No change needed there.

On `activeProfile` change (profile switch completes): reload `profileLayout` from store — call `dh:layout:get` again and update state.

### `DashboardWidgetDeck` — no changes needed

The component already accepts `layout`, `onRemove`, and `onReorder` props. Moving it up-tree is sufficient.

### Empty State Component

New inline component `WidgetEmptyHero`:
```tsx
<div className="widget-empty-hero">
  <span className="codicon codicon-layout" />
  <p>No widgets configured for this profile.</p>
  <button onClick={() => navigate('/dashboard/widgets')}>Add Widgets</button>
</div>
```

Styled with `theme-elevated.css` hero card classes.

---

## Data Flow

```
Mount
  └─ dh:layout:get → profileLayout → Section 1 renders widget deck
                                    └─ empty? → WidgetEmptyHero

Profile switch completes
  └─ activeProfile changes → reload dh:layout:get → widget deck updates
```

---

## Error Handling

- `dh:layout:get` fails: widget section shows empty state (not error toast). Layout errors are non-fatal.

---

## Files Changed

| File | Change |
|---|---|
| `apps/desktop/src/renderer/src/pages/DashboardMainPage.tsx` | Lift `DashboardWidgetDeck` to top-level section; remove from expanded card |
| `apps/desktop/src/renderer/src/pages/DashboardPage.css` | Add `.widget-empty-hero` styles |
