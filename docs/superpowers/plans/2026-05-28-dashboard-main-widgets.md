# Dashboard-Main Widget Deck Lift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift `DashboardWidgetDeck` from inside the active profile's accordion card to a persistent full-width hero section at the top of the dashboard, always visible regardless of which profile card is selected.

**Architecture:** `DashboardMainPage.tsx` is split into two vertical sections: (1) a always-rendered widget hero that renders `DashboardWidgetDeck` driven by `profileLayout`, with an empty-state CTA when no placements exist; (2) the existing 9-profile cards grid below it. The `DashboardWidgetDeck` JSX is removed from the expanded profile card section.

**Tech Stack:** React/TypeScript, existing `DashboardWidgetDeck` component, `dh:layout:get` IPC, `theme-elevated.css` utility classes.

---

### Task 1: Read the current widget deck placement

**Files:**
- Read: `apps/desktop/src/renderer/src/pages/DashboardMainPage.tsx`

- [ ] **Step 1: Locate the DashboardWidgetDeck in DashboardMainPage**

Open `apps/desktop/src/renderer/src/pages/DashboardMainPage.tsx`. Search for `DashboardWidgetDeck`. You'll find it around line 807 inside a block like:

```tsx
{activeProfile === selectedProfileName && profileLayout && (
  <DashboardWidgetDeck
    layout={profileLayout}
    onRemove={...}
    onReorder={...}
    ...
  />
)}
```

Note the full block (lines 805–836 approximately). You will move this entire JSX chunk to the new top-level section in Task 2.

Also note the `profileLayout` state at line 78 and `layoutGet` call at line 330 (`window.dh.layoutGet({ profile: selectedProfileName })`).

---

### Task 2: Add `.widget-empty-hero` CSS

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/DashboardPage.css`

- [ ] **Step 1: Add empty-hero styles**

Open `apps/desktop/src/renderer/src/pages/DashboardPage.css`. Add at the end:

```css
.widget-empty-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 24px;
  border-radius: 12px;
  border: 1.5px dashed var(--border);
  background: var(--bg-card);
  color: var(--text-muted);
  text-align: center;
  min-height: 180px;
  margin-bottom: 24px;
}

.widget-empty-hero .codicon {
  font-size: 32px;
  color: var(--accent);
  opacity: 0.6;
}

.widget-empty-hero p {
  margin: 0;
  font-size: 14px;
}

.widget-empty-hero button {
  padding: 8px 20px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: opacity 0.15s;
}

.widget-empty-hero button:hover {
  opacity: 0.85;
}

.dashboard-widget-hero {
  margin-bottom: 24px;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/DashboardPage.css
git commit -m "style(dashboard): add widget-empty-hero and dashboard-widget-hero CSS"
```

---

### Task 3: Lift DashboardWidgetDeck to top-level section

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/DashboardMainPage.tsx`

- [ ] **Step 1: Add `useNavigate` import if not already present**

`DashboardMainPage.tsx` already imports `useNavigate` from `react-router-dom` (line 13). No change needed.

- [ ] **Step 2: Add `activeProfile` reload effect**

Find the existing `useEffect` that loads `profileLayout` (around line 330). The current code loads layout when `selectedProfileName` changes. Add a separate effect that reloads layout when `activeProfile` changes (post profile-switch):

```ts
useEffect(() => {
  if (!activeProfile) return
  window.dh.layoutGet({ profile: activeProfile }).then((res) => {
    if (res && (res as any).ok !== false) {
      setProfileLayout(res as DashboardLayoutFile)
    }
  }).catch(() => {/* non-fatal */})
}, [activeProfile])
```

Add this directly after the existing layoutGet effect.

- [ ] **Step 3: Add the WidgetHero section in JSX**

Find the outermost `<div>` that wraps the page content (the return statement, after the toast). Before the profile cards grid, insert the widget hero section:

```tsx
{/* ── Widget Hero ── */}
<div className="dashboard-widget-hero">
  {profileLayout && profileLayout.placements && profileLayout.placements.length > 0 ? (
    <DashboardWidgetDeck
      layout={profileLayout}
      onRemove={(instanceId) => {
        const next = {
          ...profileLayout,
          placements: profileLayout.placements.filter((p) => p.instanceId !== instanceId)
        }
        setProfileLayout(next)
        void window.dh.layoutSet({ profile: activeProfile ?? 'web-dev', layout: next })
      }}
      onReorder={(fromId, toId) => {
        const fromIdx = profileLayout.placements.findIndex((p) => p.instanceId === fromId)
        const toIdx = profileLayout.placements.findIndex((p) => p.instanceId === toId)
        if (fromIdx === -1 || toIdx === -1) return
        const nextPlacements = [...profileLayout.placements]
        const [moved] = nextPlacements.splice(fromIdx, 1)
        nextPlacements.splice(toIdx, 0, moved)
        const next = { ...profileLayout, placements: nextPlacements }
        setProfileLayout(next)
        void window.dh.layoutSet({ profile: activeProfile ?? 'web-dev', layout: next })
      }}
      layout={profileLayout}
    />
  ) : (
    <div className="widget-empty-hero">
      <span className="codicon codicon-layout" aria-hidden />
      <p>No widgets configured for this profile.</p>
      <button type="button" onClick={() => navigate('/dashboard/widgets')}>
        Add Widgets →
      </button>
    </div>
  )}
</div>
```

> **Note:** The `onRemove` and `onReorder` props above reference `activeProfile` as the profile key for `layoutSet`. Look at how the existing DashboardWidgetDeck call passes the profile (line ~808) and use the same pattern.

- [ ] **Step 4: Remove DashboardWidgetDeck from the expanded profile card**

Find the existing `{activeProfile === selectedProfileName && profileLayout && ( <DashboardWidgetDeck ... /> )}` block (around line 805). Delete it entirely. The widget deck is now only in the hero section above.

- [ ] **Step 5: Typecheck**

```bash
cd apps/desktop && pnpm typecheck 2>&1
```

Expected: no errors.

- [ ] **Step 6: Manual smoke test**

Run `pnpm dev`. Navigate to `/dashboard`. Verify:
1. Widget deck (or empty-state CTA) is visible at the top of the page before the profile cards.
2. Switching profiles (Start on a different profile card) reloads the widget deck for that profile.
3. The expanded profile card no longer contains the widget deck.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/DashboardMainPage.tsx
git commit -m "feat(dashboard): lift DashboardWidgetDeck to persistent hero section"
```
