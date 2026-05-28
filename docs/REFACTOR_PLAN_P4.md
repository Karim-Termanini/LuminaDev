# Refactoring Plan: Address File Size Debt (P4)

This plan outlines the systematic, phased refactoring of three monolithic page components in `apps/desktop` to improve codebase maintainability, readability, and performance:
1. **`DockerPage.tsx`** (~3,664 lines)
2. **`GitConfigPage.tsx`** (~2,835 lines)
3. **`ProfilesPage.tsx`** (~2,704 lines)

The goal is to extract modular sub-components, helper utilities, and drawers into dedicated files without altering any runtime features, user interfaces, or styling.

---

## Phase 1: `DockerPage.tsx` Deconstruction

Currently, `DockerPage.tsx` handles Docker container management, image pulling/listing, volumes, networks, custom containers creation forms, inspect drawers, and custom terminal terminals.

### Proposed Changes

#### 1.1 Extract Utility Functions to `DockerUtils.ts`
- Create `apps/desktop/src/renderer/src/pages/docker/DockerUtils.ts`.
- Move the following stateless utilities:
  - `truncateMiddle`
  - `parsePortMappings`
  - `parseVolumeMappings`
  - `getNetworkDescription`
  - `getVolumeDescription`
  - `parseEnvLines`
  - `extractFirstHostPort`
- Add JSDoc descriptions and export them.

#### 1.2 Extract `DockerContainersTab.tsx`
- Create `apps/desktop/src/renderer/src/pages/docker/DockerContainersTab.tsx`.
- Extract components and types:
  - `ContainerTable`
  - `ContainerInspectDrawer`
  - `DockerTerminalModal`
- Props to receive:
  - Active profile ID / active profile object.
  - Search query / filter terms.
  - Callbacks for container control actions (start, stop, remove, restart) or inject those calls via IPC wrappers inside the component.
  - Reload trigger indicators.

#### 1.3 Extract `DockerImagesTab.tsx`
- Create `apps/desktop/src/renderer/src/pages/docker/DockerImagesTab.tsx`.
- Move the images listing tables, image deletion dialogs, and the "Pull Custom Image" dialog box / form logic.

#### 1.4 Extract `DockerVolumesTab.tsx`
- Create `apps/desktop/src/renderer/src/pages/docker/DockerVolumesTab.tsx`.
- Move volumes list grid, volume metadata details, custom volume creator form, and prune operations.

#### 1.5 Extract `DockerNetworksTab.tsx`
- Create `apps/desktop/src/renderer/src/pages/docker/DockerNetworksTab.tsx`.
- Move networks list table, custom network creator form, and prune operations.

#### 1.6 Clean up `DockerPage.tsx`
- Re-import the extracted sub-components and utilities.
- Reduce file length to under 400 lines, focused entirely on tab switching, engine status checking, and loading overlays.

---

## Phase 2: `GitConfigPage.tsx` Deconstruction

`GitConfigPage.tsx` handles Git configuration, profile loading, identity forms, diagnostic scans, and the full Git Doctor panel.

### Proposed Changes

#### 2.1 Extract Utility Functions to `GitConfigUtils.ts`
- Create `apps/desktop/src/renderer/src/pages/git/GitConfigUtils.ts`.
- Move:
  - Identity/security/performance/compatibility score calculators (`identityScore`, `securityScore`, etc.).
  - Category mapping (`categorize`) and risk level detection (`riskForRow`).
  - Sensitive value masks (`isSensitive`, `maskValue`).
  - Form validation (`validateIdentity`) and suggestion builder (`buildSuggestions`).

#### 2.2 Extract `GitDoctorPanel.tsx`
- Create `apps/desktop/src/renderer/src/pages/git/GitDoctorPanel.tsx`.
- Extract components:
  - `GitDoctor` (contains scanner actions and report renderers).
  - `ScoreCard` (displays identity metrics and compatibility scores).
  - `SecurityRow` (displays individual security status reports).
  - `BehaviorToggle` (toggles commit behaviors and GPG flags).
- Wire the diagnostics running logic (`runDiagnostics` and `fixActionToHandler`).

#### 2.3 Extract `GitConfigInspector.tsx`
- Create `apps/desktop/src/renderer/src/pages/git/GitConfigInspector.tsx`.
- Extract `InspectorSection` containing the grid/table of raw keys/values, filter search, key creation inputs, and deletion dialogs.

#### 2.4 Clean up `GitConfigPage.tsx`
- Import all extracted sections (Overview, Identity, Security, Behavior, Inspector, Diagnostics, Backups).
- Ensure the main tab shell renders the sub-pages cleanly.

---

## Phase 3: `ProfilesPage.tsx` Deconstruction

`ProfilesPage.tsx` handles Profile CRUD operations, environment variables bindings, credential mappings, and project templates scaffolding.

### Proposed Changes

#### 3.1 Extract `ProfileWizardModal.tsx`
- Create `apps/desktop/src/renderer/src/pages/profiles/ProfileWizardModal.tsx`.
- Extract the massive 1,500-line multi-step creation wizard (steps 1 to 5: General details, Compose variant, SSH credentials, Env variables, API keys).
- Move helper functions managing custom inputs, list tags, and credentials selectors.

#### 3.2 Extract `ProfileScaffoldModal.tsx`
- Create `apps/desktop/src/renderer/src/pages/profiles/ProfileScaffoldModal.tsx`.
- Extract project template selection forms (npm/pip packages, Web Dev, Mobile ReactNative/Flutter, AI/ML scaffold options).

#### 3.3 Clean up `ProfilesPage.tsx`
- Re-import modals.
- Focus the page on rendering the list of active/inactive profiles, profile duplicates, deletions, and card layout grids.

---

## Verification Plan

### Automated Tests
- Run `pnpm typecheck` to verify that prop interfaces and import paths are correct.
- Execute frontend unit/smoke tests to ensure no broken UI components.

### Manual Verification
- Verify tab switches in `DockerPage` and check that container action triggers (Start, Stop, Inspect, Prune) execute successfully.
- Trigger a diagnostic scan in the `Git Doctor` panel and inspect variables inside the `Config Inspector` table.
- Open the Profile creation wizard, advance through all 5 steps, verify tag creations, environment variable inputs, and successfully save/edit a profile.
