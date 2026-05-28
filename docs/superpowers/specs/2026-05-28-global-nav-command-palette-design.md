# Spec: Global Nav Chrome — Search Command Palette

**Date:** 2026-05-28
**Status:** Approved

---

## Problem

The TopBar search `<input>` sets local `q` state but nothing consumes it. The left sidebar footer (Docs, Setup Wizard, Local User) is already fully wired. The only missing chrome feature is a functional search/command palette.

---

## Design

### Command Palette — `TopBar.tsx`

**Trigger:** Click on search input OR Ctrl+K shortcut (already handled in `AppShell` via `focus_search` action → `document.querySelector('.hp-search-input').focus()`). On focus: expand palette panel.

**Palette panel:**
- Drops below the search input, aligned to the input's right edge.
- Width: 400px max, min(400, viewport-width - 40px).
- Max height: 360px with scroll.
- Elevated card style: `var(--bg-elevated)`, 8px border-radius, `box-shadow: 0 8px 32px rgba(0,0,0,0.5)`.
- Dismisses on Escape or click outside.

**Result categories:**

1. **Pages** (static list, always shown when query matches):
   ```ts
   const PAGES = [
     { label: 'Dashboard', route: '/dashboard', icon: 'dashboard' },
     { label: 'Monitor', route: '/system', icon: 'pulse' },
     { label: 'Docker', route: '/docker', icon: 'package' },
     { label: 'SSH', route: '/ssh', icon: 'key' },
     { label: 'Git', route: '/git', icon: 'git-branch' },
     { label: 'Profiles', route: '/profiles', icon: 'account' },
     { label: 'Terminal', route: '/terminal', icon: 'terminal' },
     { label: 'Runtimes', route: '/runtimes', icon: 'zap' },
     { label: 'Maintenance', route: '/maintenance', icon: 'shield' },
     { label: 'Settings', route: '/settings', icon: 'settings' },
   ]
   ```

2. **Running containers** (from last `dockerList` result — fetched once on palette open if not already in local state):
   - Shows container name + image + status badge.
   - Action: navigate to `/docker`.

3. **Installed runtimes** (from localStorage status cache from Spec 1):
   - Shows runtime name + version.
   - Action: navigate to `/runtimes`.

**Filtering:** Case-insensitive substring match on label/name. No fuzzy — substring is sufficient and predictable.

**Keyboard navigation:**
- `↑` / `↓`: move highlight through results.
- `Enter`: activate highlighted result (navigate).
- `Escape`: close palette, return focus to input, clear query.

**Empty state:** "No results for '${q}'" with muted text.

**When query is empty:** Show all page routes as quick-nav (no containers/runtimes in the list to avoid noise).

### State

```ts
const [paletteOpen, setPaletteOpen] = useState(false)
const [paletteIdx, setPaletteIdx] = useState(0)
const [containers, setContainers] = useState<ContainerRow[]>([])
```

- `paletteOpen`: true when input is focused and palette is visible.
- On input blur: close palette after 150ms delay (to allow click on palette item).
- Reset `paletteIdx` to 0 on query change.

### No new IPC

Uses localStorage status cache (Spec 1) for runtimes. Fetches containers via `window.dh.dockerList()` once on palette open (not on every keystroke). Caches result until palette closes.

---

## Accessibility

- `role="combobox"` on search input, `aria-expanded={paletteOpen}`, `aria-controls="cmd-palette"`.
- `role="listbox"` on results panel, `id="cmd-palette"`.
- `role="option"` on each result, `aria-selected={idx === paletteIdx}`.
- Focus stays on input while palette is open.

---

## Error Handling

- `dockerList` fails on palette open: containers section silently absent. Pages still shown.
- Status cache missing: runtimes section absent. Pages still shown.

---

## Files Changed

| File | Change |
|---|---|
| `apps/desktop/src/renderer/src/layout/TopBar.tsx` | Add command palette: state, keyboard nav, result sections, panel UI |
| `apps/desktop/src/renderer/src/layout/AppShell.css` (or `TopBar.css`) | Palette panel styles |
