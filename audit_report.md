# تقرير التدقيق الشامل لتطبيق LuminaDev

**التاريخ:** 26 مايو 2026  
**النطاق:** تدقيق كامل للكود المصدري، التوثيق، البنية التحتية، والبيانات  
**المراجع:** `phasesPlan.md` · `README.md` · `PR_BODY.md` · `walkthrough.md` · `thoghts.md` · `CLAUDE.md` · `CONTRIBUTING.md` · `docs/*`  

---

## الملخص التنفيذي

تطبيق LuminaDev قطع شوطاً كبيراً — أكمل 12 مرحلة من أصل 16، يملك نظام IPC متين مع عقود أخطاء مُهيكلة، وبنية Monorepo منظمة. لكن التدقيق المعمّق كشف عن **فجوات جوهرية** لا يمكن تجاهلها قبل أي إصدار عام. هذا التقرير يوثّق كل نقطة بدقة.

---

## القسم الأول: البنية التحتية للباك‌إند — كارثة `lib.rs`

> [!CAUTION]
> **ملف `lib.rs` يحتوي على 5,026 سطر و219 كيلوبايت** — هذا انتهاك صريح للمعايير المكتوبة في `CLAUDE.md` و`phasesPlan.md`.

### الوضع الحالي

| المعيار المُعلن | الواقع الفعلي |
|---|---|
| `lib.rs` يجب أن يكون < 300 سطر (dispatcher فقط) | **5,026 سطر** — أكثر من 16 ضعف الحد المسموح |
| الدوال يجب أن تكون في modules منفصلة | **49 دالة** مباشرة في `lib.rs` |
| لا منطق أعمال في الملف الرئيسي | Docker، SSH، Git، Runtimes، Monitor، Compose — كلها في `lib.rs` |

### التحليل

ملف `phasesPlan.md` يحدد بوضوح في قسم "Rust Backend Architecture Standards":

- `lib.rs` مسؤولياته **فقط**: إعلان handlers، dispatcher، AppState
- أي منطق > 200 سطر → يُستخرج لـ module
- أي domain بـ 5+ دوال → module مخصص

**الواقع**: كل منطق Docker (list, action, logs, images, volumes, networks, prune, pull, search, tags, compose up/down/logs, create, remap, install) موجود مباشرة في `lib.rs`. نفس الشيء لـ SSH، Git config، Monitor، Runtimes.

**الوحدات المُستخرجة فعلياً** (22 ملف .rs) تغطي جزءاً صغيراً:
- `cloud_auth.rs` (105KB — هذا أيضاً monolith!)
- `git_vcs_*.rs` (4 ملفات)
- `runtime_*.rs` (5 ملفات)
- `project_scaffold.rs`, `readiness.rs`, `compose_profiles.rs`, `utils.rs`

### المخاطر

1. **صعوبة الصيانة**: أي تغيير في Docker يتطلب فهم 5000 سطر
2. **استحالة الاختبار المعزول**: لا يمكن اختبار منطق Docker بدون تحميل كل التطبيق
3. **تعارضات Git**: أي مطور يعمل على أي feature سيعدّل نفس الملف
4. **`cloud_auth.rs` بـ 105KB**: نفس المشكلة تتكرر — ملف واحد يحتوي كل منطق المصادقة

### التوصية

تنفيذ خطة الـ 6-Module Refactoring المكتوبة في `phasesPlan.md` (Phase 16 follow-up) **فوراً**:
- `docker_ext.rs` — كل عمليات Docker + Compose
- `terminal_pty.rs` — المنطق الطرفي
- `ssh_ext.rs` — SSH helpers
- `git_parser.rs` — Git porcelain parsers  
- `runtime_installer.rs` — مدير الحزم + تصعيد الصلاحيات

---

## القسم الثاني: صفحة الإعدادات (Phase 8) — واجهة بلا محرك

> [!WARNING]
> **Phase 8 مُعلنة "📋 PLANNED" في `phasesPlan.md` لكن 17 مكون UI موجودين فعلياً** — تناقض خطير بين التوثيق والكود.

### ما هو موجود فعلياً

مجلد `settings/` يحتوي 18 ملف:

| المكون | الحجم | الحالة الفعلية |
|---|---|---|
| `SettingsShell.tsx` | 8KB | Navigation rail يعمل |
| `SettingsGeneral.tsx` | 7KB | Startup + telemetry + projects dir — **يحفظ في store.json** |
| `SettingsResources.tsx` | 3.3KB | CPU/RAM sliders — **يحفظ لكن لا يُنفَّذ** |
| `SettingsAppEngine.tsx` | 3.7KB | IPC timeout + thread pool — **يحفظ لكن لا يُنفَّذ** |
| `SettingsShortcuts.tsx` | 5.3KB | Keybinding recorder — **يحفظ لكن لا يُنفَّذ** |
| `SettingsUpdate.tsx` | 3KB | Release channel — **لا يوجد آلية تحديث فعلية** |
| `SettingsLanguages.tsx` | 2.8KB | **English فقط**، اللغات الأخرى `disabled` |
| `SettingsExtension.tsx` | 593B | **placeholder فارغ**: "Coming in a future release" |
| `SettingsBuilder.tsx` | 3.2KB | Toolchain paths |
| `SettingsBetaFeatures.tsx` | 2.6KB | Experimental flags |
| `SettingsDateTime.tsx` | 3.7KB | 12h/24h + timezone |
| `SettingsNotification.tsx` | 4.3KB | Mute + filters |
| `SettingsHelpAbout.tsx` | 3KB | Version info |
| `SettingsPersonalization.tsx` | 5.6KB | Accent colors |
| `SettingsAccounts.tsx` | 3KB | Cloud Git accounts overview |
| `SettingsRemote.tsx` | 2.4KB | SSH bookmarks overview |
| `SettingsSystem.tsx` | 26.6KB | Hosts + env diagnostics |

### الفجوات الحرجة

1. **Resources**: الـ sliders تحفظ قيم CPU/RAM لكن الرسالة واضحة: `"These limits will be enforced by the job runner in a future release"` — أي أن الإعدادات **لا تؤثر على شيء**

2. **App Engine**: IPC timeout و thread pool size يُحفظان في `store.json` لكن **لا يُقرأان** من الباك‌إند عند التشغيل — الـ `CMD_TIMEOUT_DEFAULT` (180s) ثابت hardcoded في `lib.rs`

3. **Shortcuts**: يسجل المفاتيح ويحفظها لكن **لا يوجد listener عام** يربط الاختصارات بأفعال فعلية — المفاتيح محفوظة بلا تأثير

4. **Update**: يحفظ release channel و check-on-startup لكن **لا يوجد آلية فحص تحديثات** — لا Tauri updater، لا endpoint للتحقق

5. **Languages**: الـ i18n غير موجود. كل نصوص التطبيق **hardcoded بالإنجليزية**. لا يوجد ملفات ترجمة، لا `useTranslation`، لا framework للتدويل

6. **Extensions**: مجرد `<p>Coming in a future release</p>` — حرفياً 11 سطر

### تناقض التوثيق

`phasesPlan.md` يعرض Phase 8 كـ "📋 PLANNED" مع 12 عنصر كلها `[ ]` غير مكتملة. لكن الواقع أن المكونات **موجودة** — المشكلة أنها **واجهات بلا وظيفة حقيقية**. يجب تحديث التوثيق لتعكس الحالة الدقيقة: "UI scaffolded, backend not wired".

---

## القسم الثالث: البيانات الثابتة والوهمية

> [!IMPORTANT]
> رغم أن `phasesPlan.md` يعلن "Complete removal of mock data" في Phase 7، يوجد عدة مناطق تحتوي بيانات ثابتة أو وهمية.

### 1. `dh:perf:snapshot` — بيانات مزيفة جزئياً

```rust
json!({
    "startupMs": 150,        // ← ثابت hardcoded!
    "rssMb": rss_mb,         // ← حقيقي من /proc/self/statm
    "heapUsedMb": rss_mb / 2, // ← تقريب وهمي!
    "heapTotalMb": rss_mb,    // ← نسخة من rss
    "uptimeSec": uptime_sec   // ← حقيقي
})
```

- `startupMs: 150` — ثابت دائماً بغض النظر عن وقت البدء الفعلي
- `heapUsedMb: rss_mb / 2` — قسمة عشوائية لا تمثل الواقع
- `heapTotalMb` = `rssMb` — ليس heap حقيقي

### 2. `removableDeps` — مصفوفة فارغة دائماً

```rust
"removableDeps": [],
"blockedSharedDeps": [],
```

هذا مُوثّق كـ "known limitation" لكن يجب التأكيد: **لا يوجد رسم بياني حقيقي للاعتماديات**. المستخدم يرى قائمة فارغة دائماً عند معاينة إلغاء التثبيت.

### 3. Runtime Versions — fallback لـ `["latest"]`

```rust
if versions.is_empty() { versions.push("latest".into()); }
```

الـ runtimes التي تجلب إصدارات حقيقية من APIs:
- ✅ Node.js (public API)
- ✅ Go (public API)  
- ✅ Python (public API)

**كل الباقي** (14 runtime) يُرجع `["latest"]` فقط:
Rust, Java, Bun, Zig, Dart, Flutter, Julia, PHP, Ruby, Lua, .NET, C/C++, Octave, SBCL

### 4. OAuth Client IDs — Placeholders

```rust
// cloud_auth.rs:16
// 4) Defaults below (placeholders until the project ships real app IDs)
```

معرّفات OAuth لـ GitHub و GitLab **مؤقتة** — Device Flow يعمل لكن بمعرّفات تطوير.

### 5. Profile Cards — 4 من 9 بحالة "planned"

في `DashboardMainPage.tsx`:
```typescript
{ name: 'mobile', ..., status: 'planned' },
{ name: 'game-dev', ..., status: 'planned' },
{ name: 'infra', ..., status: 'planned' },
{ name: 'desktop-gui', ..., status: 'planned' },
```

هذه البطاقات تظهر للمستخدم مع زر "COMING SOON" معطّل. الـ compose files لهذه الـ profiles **موجودة** (`docker-compose.full.yml`) لكن الـ project scaffolding لا يدعمها كلها.

### 6. GPU Fallback

```typescript
setGpu(g.ok && typeof g.result === 'string' ? g.result : 'Intel Integrated Graphics')
```

إذا فشل `nvidia-smi`، يظهر "Intel Integrated Graphics" — ليس بالضرورة صحيحاً. يجب أن يكون "GPU: Unknown" أو قراءة `lspci`.

---

## القسم الرابع: فجوات في التوثيق

### 1. تناقضات بين الملفات

| الملف | ما يقوله | الواقع |
|---|---|---|
| `README.md` سطر 86 | `Electron stack kept under dev:electron / build:electron until removed` | **Electron حُذف بالكامل** منذ 2026-04-30 |
| `README.md` سطر 44-45 | Prerequisites مكررة لـ Tauri (سطران متشابهان) | خطأ نسخ — يجب حذف أحدهما |
| `phasesPlan.md` | Phase 9 مُعلنة "✅ DONE" **و** "📋" في Future Phases | يجب حذف النسخة المكررة في Future Phases |
| `phasesPlan.md` | Phase 15 مُعلنة "✅ DONE" **و** مذكورة كـ prerequisite لم يكتمل | نفس التكرار |
| `PR_BODY.md` | `dh:docker:remap-port: explicit not-supported error` | **Port remap يعمل فعلياً** في الكود الحالي |
| `PR_BODY.md` | `dh:docker:install: explicit not-supported error (deferred)` | **Install wizard يعمل فعلياً** مع sudo/pkexec |

### 2. `thoghts.md` — مرجع قديم

الملف يحتوي خطة Sprint بتفصيل يومي **تم تنفيذها بالكامل**. لكنه:
- يشير لـ `org.gnome.Platform//46` بينما المشروع يستخدم `//49`
- يحتوي YAML لـ CI workflows بمسارات خاطئة (`packaging/flatpak/` بدل `flatpak/`)
- لا يوضح أنه مستند تاريخي — قد يُربك المساهمين الجدد

### 3. `walkthrough.md` — قديم ومحدود

يوثّق فقط "Visual Unification" لـ Phases 2-4 و Agent B handoff. لا يذكر:
- Phase 12 (Cloud Git) — أكبر feature حديثة
- Phase 16 (System Readiness Wizard)
- Phase 15 (Theme Rollout)
- Phase 9 (Profiles Engine)

### 4. `PAGE_AUDIT.md` — كل الأعمدة `[ ]` غير محددة

160 سطر من عناصر التحقق اليدوي — **لا يوجد أي عنصر تم تأكيده** (`[x]`). الـ bugs المكتشفة (9 bugs) كلها مُعلنة "✅ FIXED" في `phasesPlan.md` لكن الـ audit checklist لم يُحدّث.

---

## القسم الخامس: المخاطر الأمنية

### 1. تخزين غير مُشفّر لمعظم البيانات

`store.json` يخزن **كل** إعدادات التطبيق كـ plain JSON:
- `general_settings`, `resources_settings`, `app_engine_settings`
- `shortcuts_settings`, `update_settings`
- `active_profile`, `custom_profiles`
- `cloud_oauth_clients`

**الاستثناء الوحيد**: `profile_credentials.enc` يستخدم AES-256-GCM (عبر `profile_credentials.rs`).

### 2. `dh:store:set` بلا تحقق من المفاتيح

```rust
"dh:store:set" => {
    let key = body.get("key").and_then(|v| v.as_str()).unwrap_or_default();
    let data = body.get("data").cloned().unwrap_or(Value::Null);
    // يكتب أي مفتاح بأي قيمة — لا يوجد allowlist
}
```

بينما `dh:store:delete` يحمي بـ `ALLOWED` list، الكتابة مفتوحة لأي مفتاح.

### 3. أوامر Shell بدون sanitization كافية

عدة IPC channels تمرر مدخلات المستخدم لأوامر `bash -c`:
- `dh:host:exec` يستخدم allowlist (آمن)
- `dh:git:config:set-key` يستخدم 20-key allowlist (آمن)
- لكن بعض المسارات في Docker (container names, image names) تمر عبر `exec_output` مباشرة

### 4. Flatpak بصلاحيات كاملة

```yaml
--filesystem=host, --device=all, --socket=session-bus, --socket=system-bus
```

هذا يعني **لا sandbox فعلي** — التطبيق يصل لكل شيء. هذا مُوثّق ومقصود لكن سيكون عائقاً أمام Flathub submission.

---

## القسم السادس: الأداء وتجربة المستخدم

### 1. صفحة Runtimes — > دقيقة تحميل

`phasesPlan.md` يوثّق هذا كمشكلة معروفة:
> "Profile the Tauri invoke calls causing the >1 minute load time"

**السبب**: `RuntimesPage.tsx` (62KB) تستدعي IPC لكل runtime (17 runtime) عند التحميل — كل استدعاء ينفّذ أوامر shell (version check, deps check). لا يوجد lazy loading أو caching.

### 2. Dashboard Polling كل 4 ثوانٍ

`DashboardMainPage.tsx` يشغل `refresh()` كل 4 ثوانٍ — يستدعي:
- `dockerList()`
- `metrics()`
- `jobsList()`
- `storeGet('custom_profiles')`
- `storeGet('active_profile')`
- `storeGet('projects_home_dir')`

هذا **6 IPC calls كل 4 ثوانٍ** — حمل غير ضروري خاصة مع قراءة/كتابة `store.json` من القرص.

### 3. `DashboardLogsPage` — Polling كل 2 ثانية

```typescript
const id = setInterval(() => {
    void refreshJobs()
    void refreshContainers()
}, 2000)
```

كل 2 ثانية: `jobsList()` + `dockerList()` — حتى عندما لا يوجد jobs أو containers.

### 4. `DashboardMainPage.tsx` — 1,562 سطر

ملف واحد يحتوي: Profile hero، metrics، widget deck، project scaffolding modal، create project wizard (5 templates)، profile switching، toast notifications. يجب تقسيمه.

---

## القسم السابع: Flatpak Release Gate — Phase 14 غير مكتملة

`phasesPlan.md` يُظهر Phase 14 كـ "🔄 IN PROGRESS" مع 4 عناصر:

| العنصر | الحالة |
|---|---|
| Full host permissions | ✅ مكتمل |
| AppStream Metadata (`metainfo.xml`) | ❌ غير موجود |
| Desktop Entry + icon assets | ❌ غير مكتمل |
| Reproducible Build (offline) | ❌ غير محقق |
| Cross-Distro Smoke (Silverblue) | ❌ غير منفّذ |

**بدون AppStream metadata**: لن يُقبل على Flathub. بدون desktop entry كاملة: لن يظهر في قائمة التطبيقات بشكل صحيح.

---

## القسم الثامن: نظام التدويل (i18n) — غير موجود

> [!WARNING]
> **لا يوجد أي بنية تحتية للتدويل في التطبيق بأكمله.**

- لا `react-i18next` أو أي مكتبة ترجمة
- لا ملفات ترجمة (`locales/`, `translations/`)
- لا `useTranslation()` hook
- كل النصوص hardcoded بالإنجليزية في 100+ ملف TSX
- `SettingsLanguages.tsx` يعرض لغات مستقبلية كلها `disabled`

تقدير الجهد لإضافة i18n: **كبير** — يتطلب:
1. تثبيت وإعداد `react-i18next`
2. استخراج كل النصوص من 100+ مكون
3. إنشاء ملفات ترجمة لكل لغة
4. ربط `SettingsLanguages` بتبديل فعلي

---

## القسم التاسع: فجوات في الاختبارات

### التغطية الحالية

| النوع | العدد | الملاحظة |
|---|---|---|
| Rust unit tests (`lib.rs` + modules) | ~50+ | معظمها لـ helpers/parsers |
| Rust integration tests | 2 ملفات (`docker_smoke.rs`, `sandbox_permission_probes.rs`) | smoke فقط |
| TypeScript contract tests | ~25 ملف `.test.ts` | تغطية جيدة لعقود الأخطاء |
| E2E tests | 1 ملف (`headlessE2e.test.ts`) | سيناريوهات محدودة |
| Settings tests | 1 ملف (`settings.test.tsx`) | أساسي |

### الفجوات

1. **لا اختبارات لـ Settings backend wiring**: هل الإعدادات المحفوظة تُقرأ فعلاً عند التشغيل؟
2. **لا اختبارات لـ Profile switching**: أحد أعقد العمليات (compose down → up → store update)
3. **لا اختبارات لـ Cloud Auth flow**: Device flow + token encryption + refresh
4. **لا اختبارات لـ Project Scaffolding**: إنشاء مشاريع (web-dev, data-science, mobile, ai-ml)
5. **لا اختبارات UI (component tests)**: لا React Testing Library، لا snapshot tests

---

## القسم العاشر: الملخص والتوصيات المرتبة حسب الأولوية

### أولوية حرجة 🔴

| # | المشكلة | التأثير |
|---|---|---|
| 1 | تفكيك `lib.rs` (5,026 سطر) | قابلية الصيانة، الاختبار، التعاون |
| 2 | ربط Settings بالباك‌إند فعلياً | Resources, Shortcuts, Update, AppEngine كلها بلا تأثير |
| 3 | إزالة البيانات الوهمية (`startupMs: 150`, `heapUsedMb: rss/2`) | مصداقية البيانات |

### أولوية عالية 🟠

| # | المشكلة | التأثير |
|---|---|---|
| 4 | أداء صفحة Runtimes (> دقيقة) | تجربة مستخدم مكسورة |
| 5 | تقليل Dashboard polling (6 IPC/4s) | استهلاك موارد غير ضروري |
| 6 | تحديث `README.md` (إزالة Electron references) | معلومات مضللة |
| 7 | Runtime versions fallback — 14 runtime بدون إصدارات حقيقية | وظيفة ناقصة |

### أولوية متوسطة 🟡

| # | المشكلة | التأثير |
|---|---|---|
| 8 | Flatpak Release Gate (AppStream, Desktop Entry) | يمنع النشر على Flathub |
| 9 | تحديث `walkthrough.md` ليشمل Phases 9, 12, 15, 16 | توثيق قديم |
| 10 | تنظيف `thoghts.md` أو أرشفته | إرباك المساهمين |
| 11 | GPU fallback — "Intel Integrated Graphics" غير دقيق | بيانات مضللة |
| 12 | `PAGE_AUDIT.md` — لا عنصر واحد مُؤكّد | فجوة في التحقق |

### أولوية مستقبلية 🟢

| # | المشكلة | التأثير |
|---|---|---|
| 13 | بنية i18n كاملة | دعم لغات متعددة |
| 14 | Component tests (React Testing Library) | جودة الواجهة |
| 15 | `cloud_auth.rs` تفكيك (105KB) | نفس مشكلة lib.rs |
| 16 | `dh:store:set` allowlist | أمان |
| 17 | OAuth production app IDs | إصدار عام |
| 18 | `DashboardMainPage.tsx` تقسيم (1,562 سطر) | قابلية الصيانة |

---

## خلاصة

التطبيق يملك **أساساً هندسياً متيناً**: IPC contracts مع Zod schemas، عقود أخطاء مُهيكلة لكل domain، CI متعدد المنصات، ونظام readiness wizard متكامل. لكن **الفجوة بين التوثيق والواقع** هي المشكلة الأكبر — خاصة في Phase 8 (Settings) و`lib.rs` monolith. معالجة العناصر الحرجة الثلاثة الأولى ستُحدث تحسيناً جذرياً في جودة المشروع وقابليته للصيانة والنشر.
