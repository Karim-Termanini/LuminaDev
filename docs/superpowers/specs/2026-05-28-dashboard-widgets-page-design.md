# Spec: Dashboard-Widgets Page — Widget Management Surface

**Date:** 2026-05-28
**Status:** Approved

---

## Problem

`DashboardWidgetsPage` is a 15-line "Coming Soon" stub. Widget management (add/remove/reorder) has no UI. The widget registry already defines `live.git-recents` and `live.cloud-notifications` but users cannot configure what appears on their dashboard.

---

## Design

### Page Layout — `DashboardWidgetsPage.tsx`

Two-column layout (elevated card style, matching Dev Home aesthetic):

**Left column — Widget Catalog (~40% width):**
- Grouped list of available widget types from `WIDGET_REGISTRY` in `widgetRegistry.ts`.
- Each entry: icon + name + description + "Add to Dashboard" button.
- Groups: "Live Data" (git-recents, cloud-notifications), "System" (future), "Custom" (future).
- "Add to Dashboard" calls `dh:layout:set` with a new placement appended to current layout. Shows toast on success.

**Right column — Active Placements (~60% width):**
- Minimap of current dashboard layout: ordered list of active widget cards.
- Each card: widget name, typeId badge, drag handle (reorder), trash icon (remove).
- Reorder: drag-and-drop using existing `DashboardWidgetDeck` drag logic pattern (HTML5).
- Remove: calls `dh:layout:set` with placement filtered out. Confirms with inline undo toast (3s).

**Header:**
- Title "Widget Gallery" + subtitle "Configure your dashboard."
- "Reset to defaults" button: restores default layout for active profile.

### Live Widget Data

`live.git-recents` widget in `DashboardWidgetDeck` already renders branch/dirty/ahead-behind data via `dh:git:vcs:repo-state`. No change needed — data is already live.

`live.cloud-notifications` widget in `DashboardWidgetDeck` renders failed pipelines + open issues via `CloudGitActivityPanel` calls. No change needed — already live.

The "remove mocked JSON" task from phasesPlan refers to older widget data files that have already been removed. No JSON mock files exist currently. This spec confirms the existing live wiring is correct.

### State

```ts
const [layout, setLayout] = useState<DashboardLayoutFile | null>(null)
```

On mount: `dh:layout:get` → `setLayout`.
On add/remove/reorder: optimistic update + `dh:layout:set` → success/revert.

---

## Data Flow

```
Mount → dh:layout:get → render catalog + placements list

Add widget
  └─ append placement → optimistic setLayout → dh:layout:set → toast

Remove widget
  ├─ filter placement → optimistic setLayout → dh:layout:set
  └─ undo toast 3s → if undo clicked → restore previous layout → dh:layout:set

Reorder
  └─ swap placements → optimistic setLayout → dh:layout:set
```

---

## Error Handling

- `dh:layout:get` fails: show empty catalog state, no crash.
- `dh:layout:set` fails: revert optimistic update, show error toast.

---

## Files Changed

| File | Change |
|---|---|
| `apps/desktop/src/renderer/src/pages/DashboardWidgetsPage.tsx` | Full implementation (replace 15-line stub) |
| `apps/desktop/src/renderer/src/pages/DashboardWidgetsPage.css` | New CSS file |
