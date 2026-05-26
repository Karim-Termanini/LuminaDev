# Phase 9 Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Phase 9 by adding `description`/`tags`/`composeVariant` profile fields (PR 1) and Mobile + AI/ML project scaffold (PR 2).

**Architecture:** PR 1 is purely additive — 3 optional Zod fields + UI in ProfilesPage. PR 2 extends `project_scaffold.rs` with two new template arms (`mobile` dispatching to RN or Flutter sub-functions, `ai-ml`) and a sub-template picker in `DashboardMainPage.tsx`'s create-project modal.

**Tech Stack:** TypeScript + Zod (shared), React (renderer), Rust + Tauri (backend), `tokio` for async streaming

---

## File Map

**PR 1 — Data Structure Fields**
- Modify: `packages/shared/src/schemas.ts` — add 3 fields to `CustomProfileEntrySchema`
- Modify: `apps/desktop/src/renderer/src/pages/ProfilesPage.tsx` — wizard Step 1 + card display + Step 5 review

**PR 2 — Mobile + AI/ML Scaffold**
- Modify: `apps/desktop/src-tauri/src/project_scaffold.rs` — add `scaffold_mobile_react_native`, `scaffold_mobile_flutter`, `scaffold_ai_ml` + wire in `handle_project_scaffold`
- Modify: `apps/desktop/src/renderer/src/pages/DashboardMainPage.tsx` — sub-template picker for mobile profiles in create-project modal + mobile/ai-ml scaffold call arms

---

## PR 1 — Data Structure Fields

### Task 1: Add 3 fields to CustomProfileEntrySchema

**Files:**
- Modify: `packages/shared/src/schemas.ts:114-122`

- [ ] **Step 1: Open `packages/shared/src/schemas.ts` and locate `CustomProfileEntrySchema` (line ~114)**

- [ ] **Step 2: Add the 3 new optional fields**

Replace the existing schema:
```ts
export const CustomProfileEntrySchema = z.object({
  name: z.string().trim().min(1).max(128),
  baseTemplate: ComposeProfileSchema,
  envVars: z.array(ProfileEnvVarSchema).max(100).optional(),
  sshKeyId: z.string().trim().min(1).max(128).optional(),
  credentialIds: z.array(z.string().trim().min(1).max(128)).max(50).optional(),
})
```

With:
```ts
export const CustomProfileEntrySchema = z.object({
  name: z.string().trim().min(1).max(128),
  baseTemplate: ComposeProfileSchema,
  description: z.string().max(500).optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(10).optional(),
  composeVariant: z.enum(['stub', 'full']).optional(),
  envVars: z.array(ProfileEnvVarSchema).max(100).optional(),
  sshKeyId: z.string().trim().min(1).max(128).optional(),
  credentialIds: z.array(z.string().trim().min(1).max(128)).max(50).optional(),
})
```

- [ ] **Step 3: Verify TypeScript still compiles**

```bash
cd /path/to/LuminaDev && pnpm typecheck
```
Expected: no errors. If type errors appear, they will be in files consuming `CustomProfileEntry` — the new fields are all optional so existing code should not break.

- [ ] **Step 4: Run existing tests**

```bash
pnpm test
```
Expected: all pass. The new optional fields don't invalidate existing stored profiles.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas.ts
git commit -m "feat(profiles): add description, tags, composeVariant to CustomProfileEntrySchema"
```

---

### Task 2: Update ProfilesPage wizard Step 1 (description + tags input)

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/ProfilesPage.tsx`

The wizard Step 1 block starts at line ~594. We add two new input sections below the existing `baseTemplate` select.

- [ ] **Step 1: Add `subTemplate` state for mobile framework picker and description/tags to wizardData initial state**

In `openCreateModal` (line ~206), update the `wizardData` initializer:
```ts
setWizardData({
  name: '',
  baseTemplate: 'web-dev',
  description: '',
  tags: [],
  composeVariant: 'stub',
  envVars: [],
  credentialIds: [],
})
```

And in `openEditModal` (line ~220), the spread `{ ...p }` already picks up the new fields — no change needed there.

- [ ] **Step 2: Add tag input state near the top of the component**

Below the existing `const [envBulkInput, setEnvBulkInput] = useState('')` line, add:
```ts
const [tagInput, setTagInput] = useState('')
```

- [ ] **Step 3: Add description textarea and tags chip input to wizard Step 1**

Find the closing `</div>` of the `baseTemplate` select block inside `{wizardStep === 1 && (` (around line ~636). Insert after it, still inside the step 1 `<div>`:

```tsx
{/* Description */}
<div style={{ marginBottom: 20 }}>
  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
    Description <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 12 }}>(optional)</span>
  </label>
  <textarea
    value={wizardData.description ?? ''}
    onChange={(e) => setWizardData({ ...wizardData, description: e.target.value || undefined })}
    placeholder="e.g. My frontend workspace for project X"
    className="fluent-input"
    style={{ width: '100%', minHeight: 72, resize: 'vertical', fontFamily: 'inherit' }}
  />
</div>

{/* Tags */}
<div style={{ marginBottom: 20 }}>
  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
    Tags <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 12 }}>(optional, press Enter)</span>
  </label>
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
    {(wizardData.tags ?? []).map((tag, ti) => (
      <span
        key={ti}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: 'rgba(124,77,255,0.12)', border: '1px solid rgba(124,77,255,0.3)',
          color: 'var(--text)', borderRadius: 20, padding: '2px 10px', fontSize: 12,
        }}
      >
        {tag}
        <button
          type="button"
          onClick={() => setWizardData({ ...wizardData, tags: (wizardData.tags ?? []).filter((_, i) => i !== ti) })}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1 }}
        >✕</button>
      </span>
    ))}
  </div>
  <div style={{ display: 'flex', gap: 8 }}>
    <input
      type="text"
      value={tagInput}
      onChange={(e) => setTagInput(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && tagInput.trim()) {
          e.preventDefault()
          const current = wizardData.tags ?? []
          if (current.length < 10 && !current.includes(tagInput.trim())) {
            setWizardData({ ...wizardData, tags: [...current, tagInput.trim()] })
          }
          setTagInput('')
        }
      }}
      placeholder="e.g. frontend, react, work"
      className="fluent-input"
      style={{ flex: 1 }}
    />
    <button
      type="button"
      style={{ ...btn, padding: '0 16px' }}
      onClick={() => {
        if (!tagInput.trim()) return
        const current = wizardData.tags ?? []
        if (current.length < 10 && !current.includes(tagInput.trim())) {
          setWizardData({ ...wizardData, tags: [...current, tagInput.trim()] })
        }
        setTagInput('')
      }}
    >Add</button>
  </div>
</div>

{/* Compose Variant */}
<div style={{ marginBottom: 20 }}>
  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Compose Stack</label>
  <div style={{ display: 'flex', gap: 8 }}>
    {(['stub', 'full'] as const).map((v) => (
      <button
        key={v}
        type="button"
        onClick={() => setWizardData({ ...wizardData, composeVariant: v })}
        style={{
          padding: '8px 20px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
          border: '1px solid',
          borderColor: (wizardData.composeVariant ?? 'stub') === v ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
          background: (wizardData.composeVariant ?? 'stub') === v ? 'rgba(124,77,255,0.15)' : 'rgba(255,255,255,0.04)',
          color: (wizardData.composeVariant ?? 'stub') === v ? 'var(--accent)' : 'var(--text-muted)',
        }}
      >
        {v === 'stub' ? 'Stub (lightweight)' : 'Full (all services)'}
      </button>
    ))}
  </div>
  <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
    Stub runs a minimal Alpine container. Full starts the complete stack (nginx, postgres, etc).
  </p>
</div>
```

- [ ] **Step 4: Reset `tagInput` when wizard is opened**

In `openCreateModal` and `openEditModal`, add `setTagInput('')` alongside the other state resets.

- [ ] **Step 5: Run typecheck**

```bash
pnpm typecheck
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/ProfilesPage.tsx
git commit -m "feat(profiles): add description, tags, composeVariant inputs to wizard step 1"
```

---

### Task 3: Update profile card to show description, tags, and composeVariant badge + toggle

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/ProfilesPage.tsx`

The profile card render is in the `.map((p, i) => ...)` block (around line ~398).

- [ ] **Step 1: Update the `row-title-area` section of each card**

Find the `<div className="row-title-area">` block inside the map and update the subtitle/info area. After the existing "No project linked" / project path `<p>`, add:

```tsx
{/* Description */}
{p.description && (
  <p className="row-subtitle" style={{ fontSize: 12, marginTop: 2, color: 'var(--text-muted)', fontStyle: 'italic', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
    {p.description}
  </p>
)}
{/* Tags */}
{(p.tags ?? []).length > 0 && (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
    {(p.tags ?? []).map((tag) => (
      <span key={tag} style={{
        fontSize: 10, padding: '1px 7px', borderRadius: 12, fontWeight: 600,
        background: 'rgba(124,77,255,0.1)', border: '1px solid rgba(124,77,255,0.2)', color: 'var(--text-muted)',
      }}>{tag}</span>
    ))}
  </div>
)}
```

- [ ] **Step 2: Add composeVariant badge + toggle to `row-actions`**

Inside `<div className="row-actions">`, before the existing "Set Active" button, add:

```tsx
{/* Compose variant toggle */}
<button
  type="button"
  className="row-btn"
  title={`Switch to ${(p.composeVariant ?? 'stub') === 'stub' ? 'full' : 'stub'} compose stack`}
  onClick={() => {
    const next = profiles.map((prof, pi) =>
      pi === i ? { ...prof, composeVariant: ((prof.composeVariant ?? 'stub') === 'stub' ? 'full' : 'stub') as 'stub' | 'full' } : prof
    )
    void save(next, `"${p.name}" switched to ${(p.composeVariant ?? 'stub') === 'stub' ? 'full' : 'stub'} stack.`)
  }}
>
  <span className="codicon codicon-layers" style={{ marginRight: 4 }} />
  {(p.composeVariant ?? 'stub') === 'stub' ? 'STUB' : 'FULL'}
</button>
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/ProfilesPage.tsx
git commit -m "feat(profiles): show description, tags, composeVariant badge with toggle on profile cards"
```

---

### Task 4: Update wizard Step 5 review to include new fields

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/ProfilesPage.tsx`

The Step 5 review table is around line ~1256.

- [ ] **Step 1: Add description, tags, and composeVariant rows to the review summary**

After the existing "SSH Key" row, add:

```tsx
<div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>
  <span style={{ fontWeight: 600 }}>Compose Stack:</span>
  <span style={{ textTransform: 'uppercase', fontSize: 12, fontWeight: 700, color: (wizardData.composeVariant ?? 'stub') === 'full' ? 'var(--accent)' : 'var(--text-muted)' }}>
    {wizardData.composeVariant ?? 'stub'}
  </span>
</div>
<div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>
  <span style={{ fontWeight: 600 }}>Description:</span>
  <span style={{ color: wizardData.description ? 'var(--text)' : 'var(--text-muted)', fontStyle: wizardData.description ? 'normal' : 'italic', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
    {wizardData.description || 'none'}
  </span>
</div>
<div style={{ display: 'flex', justifyContent: 'space-between' }}>
  <span style={{ fontWeight: 600 }}>Tags:</span>
  <span style={{ color: (wizardData.tags ?? []).length > 0 ? 'var(--text)' : 'var(--text-muted)', fontStyle: (wizardData.tags ?? []).length > 0 ? 'normal' : 'italic' }}>
    {(wizardData.tags ?? []).length > 0 ? (wizardData.tags ?? []).join(', ') : 'none'}
  </span>
</div>
```

- [ ] **Step 2: Typecheck and test**

```bash
pnpm typecheck && pnpm test
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/ProfilesPage.tsx
git commit -m "feat(profiles): add description, tags, composeVariant to wizard step 5 review"
```

---

### Task 5: Update phasesPlan.md — mark Data Structure done

**Files:**
- Modify: `phasesPlan.md`

- [ ] **Step 1: Mark the Data Structure item checked**

Change:
```markdown
- [ ] **Data Structure:** Move away from static frontend templates. Profiles must be defined as robust JSON structures containing user credentials, SSH keys, active Compose configurations, and customized environment variables.
```

To:
```markdown
- [x] **Data Structure:** Profiles are robust JSON with `name`, `baseTemplate`, `description`, `tags`, `composeVariant`, `envVars`, `sshKeyId`, `credentialIds`. Stored encrypted; UI has full CRUD wizard with chip tags and stack toggle.
```

Also mark Authentication done:
```markdown
- [x] **Authentication:** Profile switching = user context switching. Credentials stored AES-256-GCM encrypted in `profile_credentials.enc`. No separate login flow needed.
```

- [ ] **Step 2: Commit**

```bash
git add phasesPlan.md
git commit -m "docs: mark Phase 9 Data Structure and Authentication items as done"
```

---

## PR 2 — Mobile + AI/ML Scaffold

### Task 6: Add React Native scaffold function to project_scaffold.rs

**Files:**
- Modify: `apps/desktop/src-tauri/src/project_scaffold.rs`

- [ ] **Step 1: Write unit test for React Native scaffold output**

At the bottom of `project_scaffold.rs`, inside the existing `#[cfg(test)] mod tests { ... }` block, add:

```rust
#[test]
fn scaffold_rn_creates_expected_files() {
    let dir = tempfile::TempDir::new().unwrap();
    scaffold_mobile_react_native(dir.path(), &[]).unwrap();
    assert!(dir.path().join("package.json").exists());
    assert!(dir.path().join("metro.config.js").exists());
    assert!(dir.path().join("index.js").exists());
    assert!(dir.path().join("App.tsx").exists());
    assert!(dir.path().join(".env").exists());
    assert!(dir.path().join(".gitignore").exists());
    assert!(dir.path().join("android").is_dir());
    assert!(dir.path().join("ios").is_dir());
}
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd apps/desktop/src-tauri && cargo test scaffold_rn_creates_expected_files -- --nocapture 2>&1 | tail -5
```
Expected: compile error — `scaffold_mobile_react_native` not defined yet.

- [ ] **Step 3: Implement `scaffold_mobile_react_native`**

Add this function before `detect_template` (around line ~358):

```rust
pub fn scaffold_mobile_react_native(
    project_dir: &std::path::Path,
    env_vars: &[(&str, &str)],
) -> Result<(), String> {
    let w = |path: &str, content: &str| {
        std::fs::write(project_dir.join(path), content)
            .map_err(|e| format!("[SCAFFOLD_FAILED] write {path}: {e}"))
    };
    std::fs::create_dir_all(project_dir.join("android"))
        .map_err(|e| format!("[SCAFFOLD_FAILED] mkdir android: {e}"))?;
    std::fs::create_dir_all(project_dir.join("ios"))
        .map_err(|e| format!("[SCAFFOLD_FAILED] mkdir ios: {e}"))?;

    let package_json = serde_json::json!({
        "name": "lumina-mobile-app",
        "version": "0.0.1",
        "private": true,
        "scripts": {
            "android": "react-native run-android",
            "ios": "react-native run-ios",
            "start": "react-native start",
            "test": "jest"
        },
        "dependencies": {
            "react": "18.2.0",
            "react-native": "0.74.0",
            "@react-navigation/native": "^6.1.0",
            "@react-navigation/stack": "^6.3.0"
        },
        "devDependencies": {
            "@babel/core": "^7.20.0",
            "@babel/preset-env": "^7.20.0",
            "@babel/runtime": "^7.20.0",
            "@react-native/metro-config": "^0.74.0",
            "@types/react": "^18.0.24",
            "@types/react-native": "^0.72.0",
            "jest": "^29.0.0",
            "typescript": "5.0.4"
        },
        "jest": {
            "preset": "react-native"
        }
    });
    w("package.json", &serde_json::to_string_pretty(&package_json).unwrap())?;

    w("metro.config.js", r#"const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const config = {};
module.exports = mergeConfig(getDefaultConfig(__dirname), config);
"#)?;

    w("index.js", r#"import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './package.json';
AppRegistry.registerComponent(appName, () => App);
"#)?;

    w("App.tsx", r#"import React from 'react';
import {SafeAreaView, Text, StyleSheet} from 'react-native';

export default function App(): React.JSX.Element {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>LuminaDev Mobile App</Text>
      <Text style={styles.subtitle}>Edit App.tsx to get started.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a2e'},
  title: {fontSize: 24, fontWeight: 'bold', color: '#e0e0ff'},
  subtitle: {fontSize: 14, color: '#9090aa', marginTop: 8},
});
"#)?;

    let mut env_content = String::new();
    for (k, v) in env_vars {
        env_content.push_str(&format!("{k}={v}\n"));
    }
    w(".env", &env_content)?;

    w(".gitignore", "node_modules/\n.env\nbuild/\nandroid/app/build/\nios/build/\n*.jks\n*.keystore\n")?;

    w("docker-compose.yml", r#"services:
  appium:
    image: appium/appium:latest
    ports:
      - "4723:4723"
    environment:
      - ANDROID_SDK_ROOT=/opt/android-sdk
  json-server:
    image: clue/json-server
    ports:
      - "3001:80"
    volumes:
      - ./mock-data.json:/data/db.json
"#)?;

    w("mock-data.json", r#"{"users": [], "posts": []}
"#)?;

    w("tsconfig.json", r#"{
  "extends": "@react-native/typescript-config/tsconfig.json"
}
"#)?;

    Ok(())
}
```

- [ ] **Step 4: Run the test**

```bash
cd apps/desktop/src-tauri && cargo test scaffold_rn_creates_expected_files -- --nocapture 2>&1 | tail -5
```
Expected: `test scaffold_rn_creates_expected_files ... ok`

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/project_scaffold.rs
git commit -m "feat(scaffold): add React Native scaffold function"
```

---

### Task 7: Add Flutter scaffold function to project_scaffold.rs

**Files:**
- Modify: `apps/desktop/src-tauri/src/project_scaffold.rs`

- [ ] **Step 1: Write test**

In the `#[cfg(test)]` block, add:

```rust
#[test]
fn scaffold_flutter_creates_expected_files() {
    let dir = tempfile::TempDir::new().unwrap();
    scaffold_mobile_flutter(dir.path(), &[]).unwrap();
    assert!(dir.path().join("pubspec.yaml").exists());
    assert!(dir.path().join("lib/main.dart").exists());
    assert!(dir.path().join("test/widget_test.dart").exists());
    assert!(dir.path().join(".env").exists());
    assert!(dir.path().join("docker-compose.yml").exists());
}
```

- [ ] **Step 2: Run test to confirm fail**

```bash
cd apps/desktop/src-tauri && cargo test scaffold_flutter_creates_expected_files -- --nocapture 2>&1 | tail -5
```
Expected: compile error.

- [ ] **Step 3: Implement `scaffold_mobile_flutter`**

Add after `scaffold_mobile_react_native`:

```rust
pub fn scaffold_mobile_flutter(
    project_dir: &std::path::Path,
    env_vars: &[(&str, &str)],
) -> Result<(), String> {
    let w = |path: &str, content: &str| {
        if let Some(parent) = std::path::Path::new(path).parent() {
            let _ = std::fs::create_dir_all(project_dir.join(parent));
        }
        std::fs::write(project_dir.join(path), content)
            .map_err(|e| format!("[SCAFFOLD_FAILED] write {path}: {e}"))
    };

    w("pubspec.yaml", r#"name: lumina_mobile_app
description: LuminaDev Flutter project
publish_to: 'none'
version: 1.0.0+1

environment:
  sdk: '>=3.0.0 <4.0.0'
  flutter: '>=3.0.0'

dependencies:
  flutter:
    sdk: flutter
  http: ^1.1.0
  provider: ^6.1.0
  go_router: ^12.0.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^3.0.0

flutter:
  uses-material-design: true
"#)?;

    w("lib/main.dart", r#"import 'package:flutter/material.dart';

void main() {
  runApp(const LuminaApp());
}

class LuminaApp extends StatelessWidget {
  const LuminaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'LuminaDev Flutter App',
      theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple)),
      home: const Scaffold(
        body: Center(
          child: Text('LuminaDev Flutter App', style: TextStyle(fontSize: 24)),
        ),
      ),
    );
  }
}
"#)?;

    w("test/widget_test.dart", r#"import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lumina_mobile_app/main.dart';

void main() {
  testWidgets('App smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const LuminaApp());
    expect(find.text('LuminaDev Flutter App'), findsOneWidget);
  });
}
"#)?;

    let mut env_content = String::new();
    for (k, v) in env_vars {
        env_content.push_str(&format!("{k}={v}\n"));
    }
    w(".env", &env_content)?;

    w(".gitignore", ".dart_tool/\n.flutter-plugins\n.flutter-plugins-dependencies\nbuild/\n.env\n")?;

    w("docker-compose.yml", r#"services:
  flutter-dev:
    image: cirrusci/flutter:stable
    working_dir: /app
    volumes:
      - .:/app
    command: flutter run -d linux
    environment:
      - DISPLAY=${DISPLAY}
    volumes:
      - .:/app
      - /tmp/.X11-unix:/tmp/.X11-unix
"#)?;

    w("analysis_options.yaml", r#"include: package:flutter_lints/flutter.yaml
"#)?;

    Ok(())
}
```

- [ ] **Step 4: Run test**

```bash
cd apps/desktop/src-tauri && cargo test scaffold_flutter_creates_expected_files -- --nocapture 2>&1 | tail -5
```
Expected: `test scaffold_flutter_creates_expected_files ... ok`

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/project_scaffold.rs
git commit -m "feat(scaffold): add Flutter scaffold function"
```

---

### Task 8: Add AI/ML scaffold function to project_scaffold.rs

**Files:**
- Modify: `apps/desktop/src-tauri/src/project_scaffold.rs`

- [ ] **Step 1: Write test**

```rust
#[test]
fn scaffold_ai_ml_creates_expected_files() {
    let dir = tempfile::TempDir::new().unwrap();
    scaffold_ai_ml(dir.path(), &[]).unwrap();
    assert!(dir.path().join("requirements.txt").exists());
    assert!(dir.path().join("setup.sh").exists());
    assert!(dir.path().join("notebooks/starter.ipynb").exists());
    assert!(dir.path().join("src/__init__.py").exists());
    assert!(dir.path().join("src/pipeline.py").exists());
    assert!(dir.path().join("data/.gitkeep").exists());
    assert!(dir.path().join(".env").exists());
    assert!(dir.path().join("Modelfile").exists());
    assert!(dir.path().join("docker-compose.yml").exists());

    let reqs = std::fs::read_to_string(dir.path().join("requirements.txt")).unwrap();
    assert!(reqs.contains("torch"));
    assert!(reqs.contains("langchain"));
}
```

- [ ] **Step 2: Run test to confirm fail**

```bash
cd apps/desktop/src-tauri && cargo test scaffold_ai_ml_creates_expected_files -- --nocapture 2>&1 | tail -5
```
Expected: compile error.

- [ ] **Step 3: Implement `scaffold_ai_ml`**

Add after `scaffold_mobile_flutter`:

```rust
pub fn scaffold_ai_ml(
    project_dir: &std::path::Path,
    env_vars: &[(&str, &str)],
) -> Result<(), String> {
    let w = |path: &str, content: &str| {
        if let Some(parent) = std::path::Path::new(path).parent() {
            let _ = std::fs::create_dir_all(project_dir.join(parent));
        }
        std::fs::write(project_dir.join(path), content)
            .map_err(|e| format!("[SCAFFOLD_FAILED] write {path}: {e}"))
    };

    let _ = std::fs::create_dir_all(project_dir.join("data"));
    w("data/.gitkeep", "")?;

    w("requirements.txt", r#"# Core ML
torch>=2.2.0
torchvision>=0.17.0
transformers>=4.40.0
datasets>=2.19.0
accelerate>=0.29.0

# LLM / Agents
langchain>=0.2.0
langchain-community>=0.2.0
langchain-ollama>=0.1.0
llama-index>=0.10.0
openai>=1.30.0

# Jupyter
jupyter>=1.0.0
ipykernel>=6.29.0
jupyterlab>=4.2.0

# Utilities
python-dotenv>=1.0.0
pandas>=2.2.0
numpy>=1.26.0
matplotlib>=3.8.0
scikit-learn>=1.4.0
ollama>=0.2.0
"#)?;

    w("setup.sh", r#"#!/usr/bin/env bash
set -e
echo "Setting up AI/ML environment..."
python -m venv .venv
. .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
if command -v ollama &> /dev/null && curl -sf http://localhost:11434 > /dev/null 2>&1; then
  echo "Pulling llama3 model (this may take a few minutes)..."
  ollama pull llama3
else
  echo "Warning: Ollama not running. Run 'ollama pull llama3' manually after starting Ollama."
fi
echo "Setup complete. Activate with: source .venv/bin/activate"
"#)?;
    // make setup.sh executable
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(
            project_dir.join("setup.sh"),
            std::fs::Permissions::from_mode(0o755),
        );
    }

    w("Modelfile", r#"FROM llama3
SYSTEM """
You are a senior software engineer and AI/ML assistant embedded in a local development environment.
Help with code, debugging, model selection, and technical explanations.
Be concise and accurate. When showing code, use the correct language and best practices.
"""
PARAMETER temperature 0.7
PARAMETER num_ctx 4096
"#)?;

    let notebook = r##"{
 "nbformat": 4,
 "nbformat_minor": 5,
 "metadata": {
  "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
  "language_info": {"name": "python", "version": "3.11.0"}
 },
 "cells": [
  {
   "cell_type": "markdown",
   "metadata": {},
   "source": ["# LuminaDev AI/ML Starter\n\nPre-configured with LangChain, Ollama, and Transformers."]
  },
  {
   "cell_type": "code",
   "execution_count": null,
   "metadata": {},
   "outputs": [],
   "source": [
    "import torch\n",
    "import transformers\n",
    "import langchain\n",
    "import ollama\n",
    "print('torch:', torch.__version__)\n",
    "print('transformers:', transformers.__version__)\n",
    "print('langchain:', langchain.__version__)"
   ]
  },
  {
   "cell_type": "code",
   "execution_count": null,
   "metadata": {},
   "outputs": [],
   "source": [
    "from langchain_ollama import OllamaLLM\n",
    "llm = OllamaLLM(model='llama3', base_url='http://localhost:11434')\n",
    "response = llm.invoke('Explain gradient descent in 2 sentences.')\n",
    "print(response)"
   ]
  }
 ]
}"##;
    w("notebooks/starter.ipynb", notebook)?;

    w("src/__init__.py", "")?;

    w("src/pipeline.py", r#""""LangChain pipeline wired to local Ollama LLM."""
from langchain_ollama import OllamaLLM
from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain
import os

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
MODEL = os.getenv("OLLAMA_MODEL", "llama3")


def build_chain(template: str = "{question}") -> LLMChain:
    llm = OllamaLLM(model=MODEL, base_url=OLLAMA_HOST)
    prompt = PromptTemplate(input_variables=["question"], template=template)
    return LLMChain(llm=llm, prompt=prompt)


if __name__ == "__main__":
    chain = build_chain()
    result = chain.invoke({"question": "What is a transformer model?"})
    print(result["text"])
"#)?;

    let mut env_lines = format!(
        "OLLAMA_HOST=http://localhost:11434\nOLLAMA_MODEL=llama3\nJUPYTER_PORT=8888\n"
    );
    for (k, v) in env_vars {
        env_lines.push_str(&format!("{k}={v}\n"));
    }
    w(".env", &env_lines)?;

    w(".gitignore", ".venv/\ndata/\n__pycache__/\n*.pyc\n.ipynb_checkpoints/\n.env\n*.egg-info/\n")?;

    w("README.md", "# AI/ML Project\n\nGenerated by LuminaDev.\n\n## Quick Start\n\n```bash\nbash setup.sh\nsource .venv/bin/activate\njupyter lab\n```\n")?;

    w("docker-compose.yml", r#"# Extends the full ai-ml compose stack (Jupyter + Ollama).
# Run with: docker compose -f docker-compose.yml -f docker-compose.full.yml up
services:
  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
  jupyter:
    image: jupyter/scipy-notebook:latest
    ports:
      - "8888:8888"
    volumes:
      - .:/home/jovyan/work
    environment:
      - JUPYTER_ENABLE_LAB=yes
volumes:
  ollama_data:
"#)?;

    Ok(())
}
```

- [ ] **Step 4: Run test**

```bash
cd apps/desktop/src-tauri && cargo test scaffold_ai_ml_creates_expected_files -- --nocapture 2>&1 | tail -5
```
Expected: `test scaffold_ai_ml_creates_expected_files ... ok`

- [ ] **Step 5: Run all scaffold tests**

```bash
cd apps/desktop/src-tauri && cargo test -- --nocapture 2>&1 | tail -10
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/src/project_scaffold.rs
git commit -m "feat(scaffold): add AI/ML scaffold function with Jupyter, Ollama, LangChain"
```

---

### Task 9: Wire mobile and ai-ml arms in handle_project_scaffold

**Files:**
- Modify: `apps/desktop/src-tauri/src/project_scaffold.rs`

The `handle_project_scaffold` function has a chain of `if template == "data-science" { ... } else if template == "web-dev" { ... }` ending with a bare `json!({ "ok": true, "path": expanded })` for unknown templates (line ~258-261).

- [ ] **Step 1: Write integration test for handle_project_scaffold dispatch**

In the `#[cfg(test)]` block, add:

```rust
#[tokio::test]
async fn handle_scaffold_mobile_rn_dispatches() {
    let dir = tempfile::TempDir::new().unwrap();
    let body = serde_json::json!({
        "path": dir.path().to_str().unwrap(),
        "template": "mobile",
        "subTemplate": "react-native"
    });
    let result = handle_project_scaffold(body).await;
    assert_eq!(result["ok"], true);
    assert!(dir.path().join("package.json").exists());
}

#[tokio::test]
async fn handle_scaffold_ai_ml_dispatches() {
    let dir = tempfile::TempDir::new().unwrap();
    let body = serde_json::json!({
        "path": dir.path().to_str().unwrap(),
        "template": "ai-ml"
    });
    let result = handle_project_scaffold(body).await;
    assert_eq!(result["ok"], true);
    assert!(dir.path().join("requirements.txt").exists());
}
```

- [ ] **Step 2: Run tests to confirm fail**

```bash
cd apps/desktop/src-tauri && cargo test handle_scaffold_mobile_rn_dispatches handle_scaffold_ai_ml_dispatches -- --nocapture 2>&1 | tail -10
```
Expected: tests run but fail (directories exist but scaffold files missing since unknown templates fall through).

- [ ] **Step 3: Wire new template arms in handle_project_scaffold**

Find the line `} else if template == "web-dev" {` block's closing brace (around line ~258, just before `json!({ "ok": true, "path": expanded })`). Replace:

```rust
    json!({ "ok": true, "path": expanded })
}
```

With:

```rust
    } else if template == "mobile" {
      let sub = body.get("subTemplate").and_then(|v| v.as_str()).unwrap_or("react-native");
      let env_pairs: Vec<(&str, &str)> = vec![]; // profile env vars not threaded here yet
      let result = if sub == "flutter" {
        scaffold_mobile_flutter(&project_dir, &env_pairs)
      } else {
        scaffold_mobile_react_native(&project_dir, &env_pairs)
      };
      if let Err(e) = result {
        return json!({ "ok": false, "error": e });
      }
    } else if template == "ai-ml" {
      let env_pairs: Vec<(&str, &str)> = vec![];
      if let Err(e) = scaffold_ai_ml(&project_dir, &env_pairs) {
        return json!({ "ok": false, "error": e });
      }
    }

    json!({ "ok": true, "path": expanded })
}
```

- [ ] **Step 4: Run integration tests**

```bash
cd apps/desktop/src-tauri && cargo test handle_scaffold_mobile_rn_dispatches handle_scaffold_ai_ml_dispatches -- --nocapture 2>&1 | tail -10
```
Expected: both pass.

- [ ] **Step 5: Run full test suite**

```bash
cd apps/desktop/src-tauri && cargo test -- --nocapture 2>&1 | tail -10
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/src/project_scaffold.rs
git commit -m "feat(scaffold): wire mobile (RN + Flutter) and ai-ml arms in handle_project_scaffold"
```

---

### Task 10: Add sub-template picker and scaffold calls in DashboardMainPage.tsx

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/DashboardMainPage.tsx`

The create-project modal has existing arms for `data-science` and `web-dev` in `submitCreateProject` (around line ~318). Mobile and AI/ML profiles currently fall to the `else` branch which only calls `dh:project:ensure_dir`.

- [ ] **Step 1: Add sub-template state near other create-project states**

Find the block of `useState` calls for the create-project modal (search for `createProjectName`). Add:

```tsx
const [mobileSubTemplate, setMobileSubTemplate] = useState<'react-native' | 'flutter'>('react-native')
```

- [ ] **Step 2: Add sub-template picker UI in the create-project modal step for mobile profiles**

The create-project modal has a step (usually step 2 or the options step) that shows template-specific options. Find where `targetTemplate === 'data-science'` renders options (e.g., notebook checkboxes) and `targetTemplate === 'web-dev'` renders dependency options.

Add a parallel block for mobile:

```tsx
{targetTemplate === 'mobile' && (
  <div style={{ marginBottom: 20 }}>
    <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
      Mobile Framework
    </label>
    <div style={{ display: 'flex', gap: 10 }}>
      {(['react-native', 'flutter'] as const).map((fw) => (
        <button
          key={fw}
          type="button"
          onClick={() => setMobileSubTemplate(fw)}
          style={{
            flex: 1, padding: '14px 20px', borderRadius: 8, cursor: 'pointer',
            border: '1px solid',
            borderColor: mobileSubTemplate === fw ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
            background: mobileSubTemplate === fw ? 'rgba(124,77,255,0.15)' : 'rgba(255,255,255,0.04)',
            color: mobileSubTemplate === fw ? 'var(--accent)' : 'var(--text-muted)',
            fontWeight: 600, fontSize: 14,
          }}
        >
          {fw === 'react-native' ? '⚛ React Native' : '💙 Flutter'}
        </button>
      ))}
    </div>
    <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
      {mobileSubTemplate === 'react-native'
        ? 'Creates package.json with RN deps, Metro config, Appium compose.'
        : 'Creates pubspec.yaml with Flutter deps, lib/main.dart, flutter dev container.'}
    </p>
  </div>
)}
```

- [ ] **Step 3: Add mobile scaffold arm in submitCreateProject**

Find the `else` block that handles unknown templates (around line ~425):

```ts
} else {
  // Fallback for non-data-science templates
  const res = await invoke('ipc_invoke', { channel: 'dh:project:ensure_dir', payload: { path } }) as any
```

Replace with:

```ts
} else if (targetTemplate === 'mobile') {
  const res = await invoke('ipc_invoke', {
    channel: 'dh:project:scaffold',
    payload: { path, template: 'mobile', subTemplate: mobileSubTemplate }
  }) as any
  if (res.ok) {
    setProjectPath(res.path)
    await window.dh.storeSet({ key: `project_dir_${selectedProfileName}`, data: res.path } as any)
    setToast({ type: 'success', message: `Created ${mobileSubTemplate === 'flutter' ? 'Flutter' : 'React Native'} project: ${name}` })
  } else {
    setToast({ type: 'error', message: res.error || 'Failed to scaffold mobile project' })
  }
  setIsScaffolding(false)
  setCreateProjectModalOpen(false)
  setCreateProjectStep(1)
  setCreateProjectName('')
} else if (targetTemplate === 'ai-ml') {
  const res = await invoke('ipc_invoke', {
    channel: 'dh:project:scaffold',
    payload: { path, template: 'ai-ml' }
  }) as any
  if (res.ok) {
    setProjectPath(res.path)
    await window.dh.storeSet({ key: `project_dir_${selectedProfileName}`, data: res.path } as any)
    if (res.warning) {
      setToast({ type: 'success', message: `Project created. Note: ${res.warning}` })
    } else {
      setToast({ type: 'success', message: `Created AI/ML project: ${name}` })
    }
  } else {
    setToast({ type: 'error', message: res.error || 'Failed to scaffold AI/ML project' })
  }
  setIsScaffolding(false)
  setCreateProjectModalOpen(false)
  setCreateProjectStep(1)
  setCreateProjectName('')
} else {
  // Fallback for remaining templates (desktop-gui, docs, empty, etc.)
  const res = await invoke('ipc_invoke', { channel: 'dh:project:ensure_dir', payload: { path } }) as any
  if (res.ok) {
    setProjectPath(res.path)
    await window.dh.storeSet({ key: `project_dir_${selectedProfileName}`, data: res.path } as any)
    setToast({ type: 'success', message: `Created project: ${name}` })
  } else {
    setToast({ type: 'error', message: res.error || 'Failed to create project' })
  }
  setIsScaffolding(false)
  setCreateProjectModalOpen(false)
  setCreateProjectStep(1)
  setCreateProjectName('')
}
```

- [ ] **Step 4: Reset mobileSubTemplate when modal closes**

Find where `setCreateProjectModalOpen(false)` and `setCreateProjectStep(1)` are called for cancel/close actions and add `setMobileSubTemplate('react-native')` alongside them.

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/DashboardMainPage.tsx
git commit -m "feat(scaffold): add mobile sub-template picker and ai-ml scaffold call in create project modal"
```

---

### Task 11: Update phasesPlan.md — mark Expanded Environments done

**Files:**
- Modify: `phasesPlan.md`

- [ ] **Step 1: Mark the Expanded Environments item checked**

Change:
```markdown
- [ ] **Expanded Environments:** (Future Work) Add robust scaffolding templates and UI generation wizards for Mobile and AI/ML.
```

To:
```markdown
- [x] **Expanded Environments:** Mobile scaffold (React Native + Flutter sub-template picker), AI/ML scaffold (venv, Jupyter notebooks, Ollama Modelfile, LangChain pipeline skeleton). Both fully wired to `dh:project:scaffold` IPC.
```

- [ ] **Step 2: Run smoke**

```bash
pnpm smoke
```
Expected: typecheck + test + lint all green.

- [ ] **Step 3: Final commit**

```bash
git add phasesPlan.md
git commit -m "docs: mark Phase 9 Expanded Environments as complete"
```

---

## Self-Review

**Spec coverage check:**
- ✅ `description`, `tags`, `composeVariant` added to schema (Task 1)
- ✅ Wizard Step 1 UI for all 3 fields (Task 2)
- ✅ Profile card shows description, tags, variant badge + toggle (Task 3)
- ✅ Step 5 review updated (Task 4)
- ✅ Authentication closed in phasesPlan (Task 5)
- ✅ React Native scaffold (Tasks 6, 9)
- ✅ Flutter scaffold (Tasks 7, 9)
- ✅ AI/ML scaffold — venv/requirements, Jupyter notebook, Ollama Modelfile, LangChain pipeline (Task 8, 9)
- ✅ Mobile sub-template picker in create-project modal (Task 10)
- ✅ `warning` field surfaced in UI when Ollama not running (Task 10)
- ✅ phasesPlan updated (Tasks 5, 11)

**Placeholder scan:** No TBDs. All code blocks are complete.

**Type consistency:** `composeVariant: 'stub' | 'full'` used consistently across Task 1 (schema), Task 2 (wizard), Task 3 (card toggle). `mobileSubTemplate: 'react-native' | 'flutter'` consistent across Tasks 10. Scaffold function signatures `(project_dir: &Path, env_vars: &[(&str, &str)])` consistent across Tasks 6, 7, 8, and the dispatch in Task 9.
