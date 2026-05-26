# Phase 9 Completion Design

**Date:** 2026-05-26
**Scope:** Close remaining Phase 9 items — Data Structure fields, Authentication (closed), Mobile scaffold, AI/ML scaffold.

---

## Status of Phase 9 Items

| Item | Status | Notes |
|------|--------|-------|
| Data Structure | Partial → extend with 3 fields | `description`, `tags`, `composeVariant` |
| Authentication | **Closed — already done** | Profile switching = user context switching; credentials encrypted via AES-256-GCM |
| Expanded Environments (Mobile) | Not started | React Native + Flutter sub-templates |
| Expanded Environments (AI/ML) | Not started | Full scaffold: venv, Jupyter, Ollama, LangChain skeleton |

---

## PR 1 — Data Structure Fields

### Schema changes (`packages/shared/src/schemas.ts`)

Add 3 optional fields to `CustomProfileEntrySchema`:

```ts
description: z.string().max(500).optional(),
tags: z.array(z.string().max(32)).max(10).optional(),
composeVariant: z.enum(['stub', 'full']).optional(), // defaults to 'stub' when absent
```

No breaking changes — all optional, existing profiles parse without them.

### UI changes (`ProfilesPage.tsx`)

**Wizard Step 1 (General):**
- Add `description` textarea below name field (optional, placeholder: "e.g. My frontend workspace")
- Add `tags` chip input below template selector: type a tag + Enter to add, click chip to remove

**Profile card (list view):**
- Show `description` (1 line, truncated with ellipsis) below the template badge
- Show `tags` as small inline chips if present
- Show `composeVariant` badge: `STUB` or `FULL` (muted styling)
- One-click toggle button in card actions to flip `stub ↔ full`, saves immediately via `storeSet`

**Wizard Step 5 (Review):**
- Add rows for description, tags, and compose variant in the summary table

---

## PR 2 — Mobile + AI/ML Scaffold

### IPC contract changes

`project:scaffold` payload gains a `subTemplate` field:

```ts
// packages/shared/src/schemas.ts
ProjectScaffoldRequestSchema = z.object({
  template: z.string(),
  subTemplate: z.string().optional(), // 'react-native' | 'flutter' for mobile
  projectDir: z.string(),
  envVars: z.array(ProfileEnvVarSchema).optional(),
  editorCmd: z.string().optional(),
})
```

### Backend (`apps/desktop/src-tauri/src/project_scaffold.rs`)

Extend `handle_project_scaffold` with two new template arms:

#### `"mobile"` arm

Reads `sub_template` from payload. Dispatches to:

- `scaffold_mobile_react_native(project_dir, env_vars)` — creates:
  - `package.json` (react-native, @react-navigation/native, jest deps)
  - `metro.config.js` (standard RN metro config)
  - `index.js` (RN entry point registering `App`)
  - `App.tsx` (minimal functional component)
  - `android/` and `ios/` placeholder dirs
  - `.env` (profile env vars written as KEY=VALUE)
  - `docker-compose.yml` (Appium 2 + json-server for E2E testing)
  - Runs: `npm install` (streamed)

- `scaffold_mobile_flutter(project_dir, env_vars)` — creates:
  - `pubspec.yaml` (flutter SDK >=3.0.0, http, provider deps)
  - `lib/main.dart` (minimal MaterialApp entry)
  - `test/widget_test.dart` (default flutter widget test)
  - `.env` (profile env vars)
  - `docker-compose.yml` (flutter dev container with SDK)
  - If `flutter` is in PATH: runs `flutter pub get` (streamed)
  - If not: writes files only, status message advises installing Flutter SDK

#### `"ai-ml"` arm — `scaffold_ai_ml(project_dir, env_vars)`

Creates:
```
requirements.txt      # torch, transformers, langchain, langchain-community,
                      # openai, jupyter, ipykernel, ollama, llama-index
setup.sh              # python -m venv .venv && . .venv/bin/activate &&
                      # pip install -r requirements.txt &&
                      # ollama pull llama3 (if ollama reachable)
notebooks/
  starter.ipynb       # Jupyter notebook: imports + LangChain + Ollama quickstart cells
src/
  __init__.py
  pipeline.py         # LangChain chain: OllamaLLM("llama3") → LLMChain → invoke
data/                 # empty, .gitkeep
.env                  # OLLAMA_HOST=http://localhost:11434 + profile env vars
.gitignore            # .venv/, data/, __pycache__/, *.pyc
Modelfile             # FROM llama3 + SYSTEM prompt for dev assistant
docker-compose.yml    # references existing full compose (Jupyter + Ollama services)
```

Runs: `python -m venv .venv && pip install -r requirements.txt` (streamed, like data-science).
Then attempts `ollama pull llama3` — if Ollama not running, logs a warning and continues (non-fatal).

### UI changes (`ProfilesPage.tsx`)

**Wizard Step 1 — sub-template selector:**

When `wizardData.baseTemplate === 'mobile'`, render a framework picker row below the template select:

```
Framework:  [● React Native]  [  Flutter  ]
```

Stored as `wizardData.subTemplate: 'react-native' | 'flutter'` (defaults to `'react-native'`).
Sent with scaffold IPC call.

No sub-template picker needed for `ai-ml` — there's only one variant.

### Scaffold wizard trigger

Existing scaffold flow (project link modal → `project:scaffold` IPC call) already passes `template`. PR 2 adds `subTemplate` to that call for mobile.

---

## Error handling

- **Mobile — Flutter not in PATH:** scaffold succeeds (files written), response includes `warning: "Flutter SDK not found; run 'flutter pub get' after installing"`. UI shows this as an amber status, not an error.
- **AI/ML — Ollama not running:** `ollama pull` step skipped, response includes `warning: "Ollama not reachable; run 'ollama pull llama3' manually"`. Non-fatal.
- **pip install failure:** treated as error, streamed to job log, scaffold marks failed (same as existing data-science behavior).

---

## Testing

**PR 1:**
- Update `CustomProfileEntrySchema` Zod tests to cover new fields
- Snapshot/render test for profile card with description + tags + composeVariant badge

**PR 2:**
- Unit tests in `project_scaffold.rs` for file structure: assert that expected files exist after each scaffold function runs in a TempDir
- Test `ollama pull` skip path (mock Ollama unreachable)
- Test Flutter-not-in-PATH warning path

---

## Files touched

**PR 1:**
- `packages/shared/src/schemas.ts`
- `apps/desktop/src/renderer/src/pages/ProfilesPage.tsx`

**PR 2:**
- `packages/shared/src/schemas.ts` (add `subTemplate` to scaffold request)
- `apps/desktop/src-tauri/src/project_scaffold.rs`
- `apps/desktop/src/renderer/src/pages/ProfilesPage.tsx` (sub-template picker)
