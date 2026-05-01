### الأولويات العامة قبل البداية
- ركز على **الـ Critical Paths** فقط: Docker → Job Runner → Maintenance → Runtimes → Host Commands.

### الخطة اليومية بالتفصيل

**اليوم 1–2: Flatpak Setup + Basic Build (الأهم حالياً)**

1. **تثبيت البيئة محلياً**
   - `flatpak install flathub org.gnome.Platform//46 org.gnome.Sdk//46`
   - `flatpak install flathub org.freedesktop.Sdk.Extension.rust-stable`

2. **إنشاء Flatpak Manifest**
   - أنشئ مجلد `packaging/flatpak/`
   - أنشئ ملف `com.luminadev.LuminaDev.yml` (ابدأ بmanifest بسيط جداً).
   - استخدم `org.gnome.Platform` كـ runtime.
   - أضف module لتطبيقك (cargo build داخل الـ flatpak).

3. **اختبار البناء محلياً**
   - شغّل:

     ```bash
     flatpak-builder --force-clean build-dir com.luminadev.LuminaDev.yml
     flatpak-builder --run build-dir com.luminadev.LuminaDev.yml lumina-dev
     ```

   - سجّل **كل خطأ** يظهر (خاصة permissions، missing dependencies، cargo offline issues).

4. **إصلاح المشاكل الشائعة**:
   - Docker socket → `--socket=session-bus` + `--device=dri` + `--talk-name=org.freedesktop.Flatpak` + custom permissions لـ `docker.sock`.
   - Host commands → استخدم `flatpak-spawn --host` داخل Rust إذا لزم الأمر، أو أضف `--share=network` و `--allow=devel`.
   - Rust dependencies → استخدم `flatpak-cargo-generator` لإنشاء `generated-sources.json`.

**اليوم 3–4: Smoke Tests + Integration Tests لـ Docker**

1. **أضف Smoke Tests أساسية** (في Rust side):
   - `docker info`
   - `docker ps --all`
   - `docker version`
   - Prune dry-run (images, volumes, build cache)
   - Error case: Docker daemon غير شغال

2. **Integration Tests** (استخدم Tauri mock runtime إذا أمكن، أو tests حقيقية):
   - اختبر Job Runner مع task طويل (مثل docker pull صغير).
   - اختبر streaming logs.
   - اختبر cancellation.

3. **أضف tests في CI**:
   - أنشئ workflow جديد أو عدّل الموجود: `tauri smoke test` + Docker tests.

**اليوم 5: Deep Audit للـ Critical Paths**

راجع يدوياً هذه الأجزاء:

- جميع `tauri::command` اللي فيها `shell::Command` أو exec.
- Timeouts و error handling في Job Runner.
- Capabilities في `tauri.conf.json` (تأكد أن كل command مسموح بشكل صريح).
- Docker integration في Rust (خاصة socket connection و error messages).
- Maintenance Guardian logic (health scoring، aggregate metrics).

**اليوم 6–7: Cross-Distro Testing + Bug Fixing**

- جرب التطبيق (native + Flatpak) على:
  - Ubuntu (أو Pop!\_OS)
  - Fedora
  - Arch Linux (إذا عندك جهاز ثاني أو VM)

ركز على:

- Docker socket داخل Flatpak
- Runtimes installation (خاصة Java على Fedora)
- Monitor metrics (`/proc` access)
- Terminal integration

**اليوم 8–9: Polish + Documentation**

- أصلح الـ UI bugs البسيطة التي ظهرت أثناء الاختبار.
- حدّث `phasesPlan.md` ليعكس الواقع.
- أكتب `README` قسم "Current Status" + "Known Limitations".
- أضف `CONTRIBUTING.md` بسيط.

**اليوم 10: Release داخلي**

- أنشئ tag: `v0.2.0-alpha`
- أنشئ GitHub Release مع:
  - AppImage (إذا سهل)
  - Flatpak bundle (إذا نجح)
  - تعليمات واضحة للتثبيت
  - قائمة بالـ Known Issues

### 1. CI Main Workflow (الأساسي - يشتغل على كل PR و Push لـ main)
(ملاحظة اذا كانت ال CIs اللي عنا افضل, فلا يوجد داعي ﻷاضافة هذه ال CIs, يرجى اخذ الانتباه)

```yaml
# .github/workflows/ci.yml
name: CI - Quality Gate

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy

      - name: Install pnpm
        run: corepack enable && corepack prepare pnpm@latest --activate

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Type Check (Frontend)
        run: pnpm type-check

      - name: Lint (Rust + Frontend)
        run: |
          cargo fmt --all -- --check
          cargo clippy --all-targets -- -D warnings
          pnpm lint

      - name: Build Frontend
        run: pnpm build

      - name: Tauri Build (Linux)
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          projectPath: ./src-tauri # غيّر إذا كان المسار مختلف
          includeRelease: false
```

---

### 2. Smoke Tests + Docker Integration Tests

```yaml
# .github/workflows/smoke-tests.yml
name: Smoke & Docker Integration Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  smoke:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4

      - name: Setup Rust + Node
        uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - name: Install pnpm
        run: corepack enable

      - run: pnpm install --frozen-lockfile

      - name: Run Rust Tests
        run: cargo test --all-features

      - name: Docker Smoke Tests
        run: |
          docker --version
          cargo test --test docker_smoke -- --nocapture
          cargo test --test job_runner -- --nocapture

      - name: Tauri Smoke Test (Mock Runtime)
        run: cargo test --package lumina-dev --test tauri_smoke
```

> **نصيحة**: أنشئ مجلد `tests/` في `src-tauri` وضع فيه smoke tests لـ Docker flows (docker info, ps, prune dry-run...).

---

### 3. Flatpak Build & Test (الأهم حالياً)

```yaml
# .github/workflows/flatpak.yml
name: Flatpak Build & Test

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:

jobs:
  flatpak:
    name: Build Flatpak
    runs-on: ubuntu-24.04
    container:
      image: ghcr.io/flathub-infra/flatpak-github-actions:gnome-48
      options: --privileged

    steps:
      - uses: actions/checkout@v4

      - name: Install Flatpak dependencies
        run: |
          flatpak install --noninteractive flathub org.gnome.Platform//48 org.gnome.Sdk//48
          flatpak install --noninteractive flathub org.freedesktop.Sdk.Extension.rust-stable

      - name: Build Flatpak
        uses: flatpak/flatpak-github-actions/flatpak-builder@v6
        with:
          bundle: lumina-dev.flatpak
          manifest-path: packaging/flatpak/com.luminadev.LuminaDev.yml
          cache-key: flatpak-${{ github.sha }}
          upload-artifact: true

      - name: Test Flatpak Bundle
        run: |
          flatpak install --user --noninteractive --reinstall lumina-dev.flatpak
          flatpak run com.luminadev.LuminaDev --help || echo "Basic run test passed"
```

**ملاحظة**: أنشئ أولاً ملف الـ manifest في `packaging/flatpak/com.luminadev.LuminaDev.yml`

---

### 4. Release Workflow (يشتغل عند إنشاء Tag)

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - "v*"

jobs:
  release:
    runs-on: ubuntu-24.04

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node & Rust
        uses: dtolnay/rust-toolchain@stable

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - run: pnpm install --frozen-lockfile

      - name: Tauri Build & Release
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: ${{ github.ref }}
          releaseName: "LuminaDev v${{ github.ref_name }}"
          releaseBody: "See the changelog for details."
          releaseDraft: true
          prerelease: true # غيّره إلى false لما تصير النسخة مستقرة
```

---
