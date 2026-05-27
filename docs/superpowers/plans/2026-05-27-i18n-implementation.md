# i18n Full Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire react-i18next across every UI component in LuminaDev — 3 languages (en-US, de-DE, ar-SA), 12 namespaces, RTL text direction for Arabic, ar-SA gated behind beta flag.

**Architecture:** i18next with `resourcesToBackend` for dynamic JSON imports (Vite module graph caches as singletons). I18nContext becomes a one-shot thin bridge: reads Tauri store → calls `changeLanguage()` → done. No listeners, no subscriptions, no state-based re-renders.

**Tech Stack:** `i18next`, `react-i18next`, `i18next-resources-to-backend`, Vitest for smoke tests.

---

## File Map

**Create:**
- `apps/desktop/scripts/gen-i18n-stubs.mjs` — script to generate 36 empty locale JSONs
- `apps/desktop/src/renderer/src/i18n/i18n.ts` — i18next init
- `apps/desktop/src/renderer/src/theme/rtl.css` — RTL text direction rules
- `apps/desktop/src/renderer/src/i18n/locales/en-US/common.json` (+ de-DE, ar-SA)
- `apps/desktop/src/renderer/src/i18n/locales/en-US/nav.json` (+ de-DE, ar-SA)
- `apps/desktop/src/renderer/src/i18n/locales/en-US/dashboard.json` (+ de-DE, ar-SA)
- `apps/desktop/src/renderer/src/i18n/locales/en-US/docker.json` (+ de-DE, ar-SA)
- `apps/desktop/src/renderer/src/i18n/locales/en-US/git.json` (+ de-DE, ar-SA)
- `apps/desktop/src/renderer/src/i18n/locales/en-US/ssh.json` (+ de-DE, ar-SA)
- `apps/desktop/src/renderer/src/i18n/locales/en-US/runtimes.json` (+ de-DE, ar-SA)
- `apps/desktop/src/renderer/src/i18n/locales/en-US/monitor.json` (+ de-DE, ar-SA)
- `apps/desktop/src/renderer/src/i18n/locales/en-US/maintenance.json` (+ de-DE, ar-SA)
- `apps/desktop/src/renderer/src/i18n/locales/en-US/profiles.json` (+ de-DE, ar-SA)
- `apps/desktop/src/renderer/src/i18n/locales/en-US/settings.json` (+ de-DE, ar-SA)
- `apps/desktop/src/renderer/src/i18n/locales/en-US/readiness.json` (+ de-DE, ar-SA)
- `apps/desktop/src/renderer/src/__tests__/i18n.smoke.test.ts`

**Modify:**
- `apps/desktop/package.json` — add `i18n:stubs` script
- `apps/desktop/src/renderer/src/i18n/I18nContext.tsx` — rewrite as thin bridge
- `apps/desktop/src/renderer/src/main.tsx` — add `i18n.ts` + `rtl.css` imports
- `apps/desktop/src/renderer/src/layout/AppShell.tsx` — wire nav + footer strings
- `apps/desktop/src/renderer/src/layout/TopBar.tsx` — wire titles + tab labels + strings
- `apps/desktop/src/renderer/src/layout/ActiveJobsStrip.tsx` — wire status strings
- `apps/desktop/src/renderer/src/pages/settings/SettingsLanguages.tsx` — enable de-DE, gate ar-SA behind beta flag, switch to useTranslation from react-i18next
- All Phase 2 page components (see Task 11–23)

**Delete:**
- `apps/desktop/src/renderer/src/i18n/translations.ts` — after Phase 1 complete

---

## Phase 1 — Install + Init + Infrastructure

### Task 1: Install packages

**Files:**
- Modify: `apps/desktop/package.json`

- [ ] **Step 1: Install i18next packages**

```bash
cd apps/desktop && pnpm add i18next react-i18next i18next-resources-to-backend
```

- [ ] **Step 2: Verify installation**

```bash
cd apps/desktop && pnpm list i18next react-i18next i18next-resources-to-backend
```

Expected: all 3 packages listed with versions.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/package.json apps/desktop/pnpm-lock.yaml
git commit -m "chore: add i18next, react-i18next, i18next-resources-to-backend"
```

---

### Task 2: Write stub generator script + generate all 36 locale files

**Files:**
- Create: `apps/desktop/scripts/gen-i18n-stubs.mjs`
- Modify: `apps/desktop/package.json` (add script)

- [ ] **Step 1: Write the script**

`apps/desktop/scripts/gen-i18n-stubs.mjs`:
```js
import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const localesDir = join(__dirname, '../src/renderer/src/i18n/locales')

const LOCALES = ['en-US', 'de-DE', 'ar-SA']
const NAMESPACES = [
  'common', 'nav', 'dashboard', 'docker', 'git', 'ssh',
  'runtimes', 'monitor', 'maintenance', 'profiles', 'settings', 'readiness',
]

for (const locale of LOCALES) {
  for (const ns of NAMESPACES) {
    const dir = join(localesDir, locale)
    const file = join(dir, `${ns}.json`)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    if (!existsSync(file)) {
      writeFileSync(file, '{}\n', 'utf8')
      console.log(`created ${locale}/${ns}.json`)
    } else {
      console.log(`skip   ${locale}/${ns}.json (exists)`)
    }
  }
}
```

- [ ] **Step 2: Add script to package.json**

In `apps/desktop/package.json`, add to `"scripts"`:
```json
"i18n:stubs": "node scripts/gen-i18n-stubs.mjs"
```

- [ ] **Step 3: Run the script**

```bash
cd apps/desktop && pnpm i18n:stubs
```

Expected output: 36 lines — `created` for all `locale/namespace.json` combinations.

- [ ] **Step 4: Verify 36 files exist**

```bash
find apps/desktop/src/renderer/src/i18n/locales -name '*.json' | wc -l
```

Expected: `36`

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/scripts/gen-i18n-stubs.mjs apps/desktop/package.json apps/desktop/src/renderer/src/i18n/locales/
git commit -m "feat(i18n): add stub generator script and 36 empty locale files"
```

---

### Task 3: Write i18n.ts init

**Files:**
- Create: `apps/desktop/src/renderer/src/i18n/i18n.ts`

- [ ] **Step 1: Write the file**

`apps/desktop/src/renderer/src/i18n/i18n.ts`:
```ts
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import resourcesToBackend from 'i18next-resources-to-backend'

i18n
  .use(
    resourcesToBackend(
      (lang: string, ns: string) => import(`./locales/${lang}/${ns}.json`)
    )
  )
  .use(initReactI18next)
  .init({
    fallbackLng: 'en-US',
    defaultNS: 'common',
    ns: [
      'common', 'nav', 'dashboard', 'docker', 'git', 'ssh',
      'runtimes', 'monitor', 'maintenance', 'profiles', 'settings', 'readiness',
    ],
    interpolation: { escapeValue: false },
    missingKeyHandler: import.meta.env.DEV
      ? (_lngs: readonly string[], ns: string, key: string) =>
          console.error(`[i18n] Missing key: ${ns}:${key}`)
      : undefined,
  })

export default i18n
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/desktop && pnpm typecheck 2>&1 | grep i18n
```

Expected: no errors from `i18n.ts`.

---

### Task 4: Write rtl.css

**Files:**
- Create: `apps/desktop/src/renderer/src/theme/rtl.css`

- [ ] **Step 1: Write the file**

`apps/desktop/src/renderer/src/theme/rtl.css`:
```css
/* RTL text direction — text alignment only, no layout mirror */

.hp-rtl p,
.hp-rtl label,
.hp-rtl h1,
.hp-rtl h2,
.hp-rtl h3,
.hp-rtl h4 {
  text-align: right;
}

.hp-rtl input:not([type="number"]),
.hp-rtl textarea,
.hp-rtl select {
  text-align: right;
}

/* Code, terminal, paths — always LTR */
.hp-rtl code,
.hp-rtl pre,
.hp-rtl .mono,
.hp-rtl [data-ltr] {
  direction: ltr;
  unicode-bidi: plaintext;
  text-align: left;
}

/* Numbers stay LTR inline in RTL prose */
.hp-rtl [data-numeric] {
  direction: ltr;
  unicode-bidi: embed;
}
```

---

### Task 5: Rewrite I18nContext.tsx as thin bridge

**Files:**
- Modify: `apps/desktop/src/renderer/src/i18n/I18nContext.tsx`

Current file: 53 lines with custom `t()` context, reads from Tauri store, maintains `locale` state.

New file — one-shot bridge only. No state. No listeners. No custom `t()`. react-i18next's `useTranslation` hook replaces the custom `t`.

- [ ] **Step 1: Rewrite I18nContext.tsx**

Replace the entire file:

```tsx
import { createContext, useContext, useEffect, type ReactNode } from 'react'
import i18n from './i18n'

interface I18nBridgeContextType {
  setLocale: (locale: string) => Promise<void>
}

const I18nBridgeContext = createContext<I18nBridgeContextType | undefined>(undefined)

export function I18nProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void window.dh.storeGet({ key: 'language_settings' }).then((res) => {
      const data = res?.data as Record<string, unknown> | undefined
      const locale = (data?.locale as string | undefined) ?? 'en-US'
      void i18n.changeLanguage(locale)
      applyDomLocale(locale)
    })
  }, [])

  const setLocale = async (locale: string): Promise<void> => {
    void i18n.changeLanguage(locale)
    applyDomLocale(locale)
    await window.dh.storeSet({
      key: 'language_settings',
      data: { locale },
    })
  }

  return (
    <I18nBridgeContext.Provider value={{ setLocale }}>
      {children}
    </I18nBridgeContext.Provider>
  )
}

export function useI18nBridge(): I18nBridgeContextType {
  const ctx = useContext(I18nBridgeContext)
  if (!ctx) throw new Error('useI18nBridge must be used within I18nProvider')
  return ctx
}

function applyDomLocale(locale: string): void {
  document.documentElement.lang = locale.split('-')[0]
  if (locale === 'ar-SA') {
    document.documentElement.dir = 'rtl'
    document.documentElement.classList.add('hp-rtl')
  } else {
    document.documentElement.dir = 'ltr'
    document.documentElement.classList.remove('hp-rtl')
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/desktop && pnpm typecheck 2>&1 | grep -E 'I18nContext|translations'
```

Expected: errors about missing `translations` import and old `useTranslation` usage — these will be fixed in Task 10 (SettingsLanguages) and Phase 2.

---

### Task 6: Update main.tsx

**Files:**
- Modify: `apps/desktop/src/renderer/src/main.tsx`

- [ ] **Step 1: Read current main.tsx**

```bash
head -20 apps/desktop/src/renderer/src/main.tsx
```

- [ ] **Step 2: Add imports**

Add these two imports near the top of `main.tsx`, after existing style imports:

```tsx
import './i18n/i18n'
import './theme/rtl.css'
```

`i18n.ts` must be imported before `<App />` renders so i18next is initialized. Import it before any component import.

- [ ] **Step 3: Verify app still starts**

```bash
cd apps/desktop && pnpm typecheck
```

Expected: no new errors.

---

### Task 7: Write i18n smoke test (TDD — write before populating JSONs)

**Files:**
- Create: `apps/desktop/src/renderer/src/__tests__/i18n.smoke.test.ts`

The smoke test asserts structural completeness: every EN key exists in DE and AR. AR values must not equal the key string (Arabic characters guarantee difference). DE structure only — correctness requires native speaker review.

- [ ] **Step 1: Write the test**

`apps/desktop/src/renderer/src/__tests__/i18n.smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest'

const NAMESPACES = [
  'common', 'nav', 'dashboard', 'docker', 'git', 'ssh',
  'runtimes', 'monitor', 'maintenance', 'profiles', 'settings', 'readiness',
] as const

const enModules = import.meta.glob('../i18n/locales/en-US/*.json', { eager: true })
const deModules = import.meta.glob('../i18n/locales/de-DE/*.json', { eager: true })
const arModules = import.meta.glob('../i18n/locales/ar-SA/*.json', { eager: true })

function load(modules: Record<string, unknown>, ns: string): Record<string, string> {
  const key = Object.keys(modules).find((k) => k.endsWith(`/${ns}.json`))
  return (key ? (modules[key] as { default?: Record<string, string> }).default ?? modules[key] : {}) as Record<string, string>
}

describe('i18n smoke', () => {
  for (const ns of NAMESPACES) {
    describe(`namespace: ${ns}`, () => {
      it('de-DE has all en-US keys', () => {
        const en = load(enModules, ns)
        const de = load(deModules, ns)
        for (const key of Object.keys(en)) {
          expect(de[key], `de-DE missing key "${key}" in ${ns}`).toBeDefined()
        }
      })

      it('ar-SA has all en-US keys and values differ from key string', () => {
        const en = load(enModules, ns)
        const ar = load(arModules, ns)
        for (const key of Object.keys(en)) {
          expect(ar[key], `ar-SA missing key "${key}" in ${ns}`).toBeDefined()
          expect(ar[key], `ar-SA key "${key}" in ${ns} has raw key as value`).not.toBe(key)
        }
      })
    })
  }
})
```

- [ ] **Step 2: Run — verify it fails (stubs are empty, no keys to check)**

```bash
cd apps/desktop && pnpm exec vitest run src/renderer/src/__tests__/i18n.smoke.test.ts
```

Expected: all tests pass trivially (empty JSONs have no keys to iterate). This is correct — the test becomes meaningful once keys are added.

---

### Task 8: Populate common.json (all 3 locales) — no component wiring yet

**Files:**
- Modify: `apps/desktop/src/renderer/src/i18n/locales/en-US/common.json`
- Modify: `apps/desktop/src/renderer/src/i18n/locales/de-DE/common.json`
- Modify: `apps/desktop/src/renderer/src/i18n/locales/ar-SA/common.json`

`common` covers buttons and status labels used everywhere.

- [ ] **Step 1: Write en-US/common.json**

```json
{
  "save": "Save",
  "saved": "Saved.",
  "cancel": "Cancel",
  "delete": "Delete",
  "loading": "Loading...",
  "error": "Error",
  "retry": "Retry",
  "confirm": "Confirm",
  "close": "Close",
  "open": "Open",
  "add": "Add",
  "remove": "Remove",
  "edit": "Edit",
  "apply": "Apply",
  "reset": "Reset",
  "refresh": "Refresh",
  "comingSoon": "Coming soon",
  "notAvailable": "Not available",
  "status.running": "Running",
  "status.stopped": "Stopped",
  "status.unknown": "Unknown",
  "status.exited": "Exited",
  "status.paused": "Paused",
  "status.completed": "Completed",
  "status.failed": "Failed",
  "status.pending": "Pending",
  "status.created": "Created",
  "status.restarting": "Restarting",
  "state.running": "Running",
  "state.completed": "Completed",
  "state.failed": "Failed",
  "state.cancelled": "Cancelled"
}
```

- [ ] **Step 2: Write de-DE/common.json**

```json
{
  "save": "Speichern",
  "saved": "Gespeichert.",
  "cancel": "Abbrechen",
  "delete": "Löschen",
  "loading": "Lädt...",
  "error": "Fehler",
  "retry": "Erneut versuchen",
  "confirm": "Bestätigen",
  "close": "Schließen",
  "open": "Öffnen",
  "add": "Hinzufügen",
  "remove": "Entfernen",
  "edit": "Bearbeiten",
  "apply": "Anwenden",
  "reset": "Zurücksetzen",
  "refresh": "Aktualisieren",
  "comingSoon": "Demnächst",
  "notAvailable": "Nicht verfügbar",
  "status.running": "Läuft",
  "status.stopped": "Gestoppt",
  "status.unknown": "Unbekannt",
  "status.exited": "Beendet",
  "status.paused": "Pausiert",
  "status.completed": "Abgeschlossen",
  "status.failed": "Fehlgeschlagen",
  "status.pending": "Ausstehend",
  "status.created": "Erstellt",
  "status.restarting": "Neustart",
  "state.running": "Läuft",
  "state.completed": "Abgeschlossen",
  "state.failed": "Fehlgeschlagen",
  "state.cancelled": "Abgebrochen"
}
```

- [ ] **Step 3: Write ar-SA/common.json**

```json
{
  "save": "حفظ",
  "saved": "تم الحفظ.",
  "cancel": "إلغاء",
  "delete": "حذف",
  "loading": "جاري التحميل...",
  "error": "خطأ",
  "retry": "إعادة المحاولة",
  "confirm": "تأكيد",
  "close": "إغلاق",
  "open": "فتح",
  "add": "إضافة",
  "remove": "إزالة",
  "edit": "تعديل",
  "apply": "تطبيق",
  "reset": "إعادة تعيين",
  "refresh": "تحديث",
  "comingSoon": "قريباً",
  "notAvailable": "غير متاح",
  "status.running": "يعمل",
  "status.stopped": "متوقف",
  "status.unknown": "غير معروف",
  "status.exited": "منتهي",
  "status.paused": "موقوف مؤقتاً",
  "status.completed": "مكتمل",
  "status.failed": "فشل",
  "status.pending": "معلق",
  "status.created": "مُنشأ",
  "status.restarting": "إعادة تشغيل",
  "state.running": "يعمل",
  "state.completed": "مكتمل",
  "state.failed": "فشل",
  "state.cancelled": "ملغى"
}
```

- [ ] **Step 4: Run smoke test — verify it passes**

```bash
cd apps/desktop && pnpm exec vitest run src/renderer/src/__tests__/i18n.smoke.test.ts
```

Expected: PASS. All common keys in EN exist in DE and AR; AR values differ from key strings.

---

### Task 9: Populate nav.json (all 3 locales) + wire AppShell, TopBar, ActiveJobsStrip

**Files:**
- Modify: `apps/desktop/src/renderer/src/i18n/locales/en-US/nav.json`
- Modify: `apps/desktop/src/renderer/src/i18n/locales/de-DE/nav.json`
- Modify: `apps/desktop/src/renderer/src/i18n/locales/ar-SA/nav.json`
- Modify: `apps/desktop/src/renderer/src/layout/AppShell.tsx`
- Modify: `apps/desktop/src/renderer/src/layout/TopBar.tsx`
- Modify: `apps/desktop/src/renderer/src/layout/ActiveJobsStrip.tsx`

- [ ] **Step 1: Write en-US/nav.json**

```json
{
  "nav.dashboard": "Dashboard",
  "nav.monitor": "Monitor",
  "nav.docker": "Docker",
  "nav.ssh": "SSH",
  "nav.git": "Developer Git",
  "nav.profiles": "Profiles",
  "nav.terminal": "Terminal",
  "nav.runtimes": "Runtimes",
  "nav.maintenance": "Maintenance",
  "nav.readiness": "Readiness",
  "nav.settings": "Settings",
  "footer.docs": "Docs",
  "footer.setupWizard": "Setup Wizard",
  "footer.switchProfile": "Switch Profile ›",
  "footer.linuxSession": "Linux session",
  "appTitle": "LuminaDev",
  "engineConnected": "LuminaDev Engine: Connected",
  "ready": "Ready.",
  "stop": "STOP",
  "jobs.count": "[{{count}} Jobs]",
  "topbar.dashboardTitle": "HYPEDEVHOME",
  "topbar.main": "Main",
  "topbar.kernels": "Kernels",
  "topbar.logs": "Logs",
  "topbar.overview": "Overview",
  "topbar.searchPlaceholder": "Search workstation...",
  "topbar.notifications": "Recent Activity & Jobs",
  "topbar.noActivity": "No recent activity.",
  "topbar.system": "System",
  "topbar.workstation": "Workstation",
  "topbar.docker": "Docker",
  "topbar.ssh": "SSH",
  "topbar.git": "Developer Git",
  "topbar.profiles": "Profiles",
  "topbar.terminal": "Terminal",
  "topbar.runtimes": "Runtimes",
  "topbar.maintenance": "Maintenance",
  "topbar.settings": "Settings",
  "topbar.linuxDevHome": "Linux Dev Home"
}
```

- [ ] **Step 2: Write de-DE/nav.json**

```json
{
  "nav.dashboard": "Dashboard",
  "nav.monitor": "Monitor",
  "nav.docker": "Docker",
  "nav.ssh": "SSH",
  "nav.git": "Entwickler Git",
  "nav.profiles": "Profile",
  "nav.terminal": "Terminal",
  "nav.runtimes": "Laufzeitumgebungen",
  "nav.maintenance": "Wartung",
  "nav.readiness": "Bereitschaft",
  "nav.settings": "Einstellungen",
  "footer.docs": "Dokumentation",
  "footer.setupWizard": "Einrichtungsassistent",
  "footer.switchProfile": "Profil wechseln ›",
  "footer.linuxSession": "Linux-Sitzung",
  "appTitle": "LuminaDev",
  "engineConnected": "LuminaDev Engine: Verbunden",
  "ready": "Bereit.",
  "stop": "STOP",
  "jobs.count": "[{{count}} Aufgaben]",
  "topbar.dashboardTitle": "HYPEDEVHOME",
  "topbar.main": "Haupt",
  "topbar.kernels": "Kernel",
  "topbar.logs": "Protokolle",
  "topbar.overview": "Übersicht",
  "topbar.searchPlaceholder": "Workstation durchsuchen...",
  "topbar.notifications": "Letzte Aktivität & Aufgaben",
  "topbar.noActivity": "Keine letzten Aktivitäten.",
  "topbar.system": "System",
  "topbar.workstation": "Workstation",
  "topbar.docker": "Docker",
  "topbar.ssh": "SSH",
  "topbar.git": "Entwickler Git",
  "topbar.profiles": "Profile",
  "topbar.terminal": "Terminal",
  "topbar.runtimes": "Laufzeitumgebungen",
  "topbar.maintenance": "Wartung",
  "topbar.settings": "Einstellungen",
  "topbar.linuxDevHome": "Linux Dev Home"
}
```

- [ ] **Step 3: Write ar-SA/nav.json**

```json
{
  "nav.dashboard": "لوحة التحكم",
  "nav.monitor": "المراقبة",
  "nav.docker": "دوكر",
  "nav.ssh": "SSH",
  "nav.git": "Git للمطورين",
  "nav.profiles": "الملفات الشخصية",
  "nav.terminal": "الطرفية",
  "nav.runtimes": "بيئات التشغيل",
  "nav.maintenance": "الصيانة",
  "nav.readiness": "الجاهزية",
  "nav.settings": "الإعدادات",
  "footer.docs": "التوثيق",
  "footer.setupWizard": "معالج الإعداد",
  "footer.switchProfile": "تبديل الملف الشخصي ›",
  "footer.linuxSession": "جلسة لينكس",
  "appTitle": "LuminaDev",
  "engineConnected": "محرك LuminaDev: متصل",
  "ready": "جاهز.",
  "stop": "إيقاف",
  "jobs.count": "[{{count}} مهام]",
  "topbar.dashboardTitle": "HYPEDEVHOME",
  "topbar.main": "الرئيسية",
  "topbar.kernels": "النوى",
  "topbar.logs": "السجلات",
  "topbar.overview": "نظرة عامة",
  "topbar.searchPlaceholder": "بحث في محطة العمل...",
  "topbar.notifications": "النشاط الأخير والمهام",
  "topbar.noActivity": "لا يوجد نشاط حديث.",
  "topbar.system": "النظام",
  "topbar.workstation": "محطة العمل",
  "topbar.docker": "دوكر",
  "topbar.ssh": "SSH",
  "topbar.git": "Git للمطورين",
  "topbar.profiles": "الملفات الشخصية",
  "topbar.terminal": "الطرفية",
  "topbar.runtimes": "بيئات التشغيل",
  "topbar.maintenance": "الصيانة",
  "topbar.settings": "الإعدادات",
  "topbar.linuxDevHome": "Linux Dev Home"
}
```

- [ ] **Step 4: Wire AppShell.tsx**

Add `useTranslation` import and replace string literals:

```tsx
import { useTranslation } from 'react-i18next'

// Inside AppShell():
const { t } = useTranslation('nav')

// Replace nav array — change to use t():
const nav = [
  { to: '/dashboard', label: t('nav.dashboard'), icon: 'dashboard', status: 'live' as RouteStatus },
  { to: '/system', label: t('nav.monitor'), icon: 'pulse', status: 'live' as RouteStatus },
  { to: '/docker', label: t('nav.docker'), icon: 'package', status: 'live' as RouteStatus },
  { to: '/ssh', label: t('nav.ssh'), icon: 'key', status: 'live' as RouteStatus },
  { to: '/git', label: t('nav.git'), icon: 'git-branch', status: 'live' as RouteStatus },
  { to: '/profiles', label: t('nav.profiles'), icon: 'account', status: 'live' as RouteStatus },
  { to: '/terminal', label: t('nav.terminal'), icon: 'terminal', status: 'live' as RouteStatus },
  { to: '/runtimes', label: t('nav.runtimes'), icon: 'zap', status: 'live' as RouteStatus },
  { to: '/maintenance', label: t('nav.maintenance'), icon: 'shield', status: 'live' as RouteStatus },
  { to: '/system-readiness', label: t('nav.readiness'), icon: 'checklist', status: 'live' as RouteStatus },
  { to: '/settings', label: t('nav.settings'), icon: 'settings', status: 'live' as RouteStatus },
]
```

NOTE: `nav` must move inside the component body (currently it's a module-level const) so `t` is in scope.

Replace footer strings in JSX:
```tsx
// "Linux session" → {t('footer.linuxSession')}
// "LuminaDev" (header title) → {t('appTitle')}
// "Docs" → {t('footer.docs')}
// "Setup Wizard" → {t('footer.setupWizard')}
// "Switch Profile ›" → {t('footer.switchProfile')}
```

- [ ] **Step 5: Wire TopBar.tsx**

```tsx
import { useTranslation } from 'react-i18next'

// Inside TopBar():
const { t } = useTranslation('nav')

// Replace titles Record:
const titles: Record<string, string> = {
  '/system': t('topbar.system'),
  '/workstation': t('topbar.workstation'),
  '/docker': t('topbar.docker'),
  '/ssh': t('topbar.ssh'),
  '/git': t('topbar.git'),
  '/profiles': t('topbar.profiles'),
  '/terminal': t('topbar.terminal'),
  '/runtimes': t('topbar.runtimes'),
  '/maintenance': t('topbar.maintenance'),
  '/settings': t('topbar.settings'),
}

// screenTitle() must also be inside component or receive t as param.
// Easiest: inline the logic in render or make screenTitle a hook.
// Replace in render:
const currentTitle = pathname === '/dashboard' || pathname.startsWith('/dashboard/')
  ? t('topbar.dashboardTitle')
  : (titles[pathname] ?? t('topbar.linuxDevHome'))
```

Replace other strings:
```tsx
// placeholder="Search workstation..." → placeholder={t('topbar.searchPlaceholder')}
// "Recent Activity & Jobs" → {t('topbar.notifications')}
// "No recent activity." → {t('topbar.noActivity')}
// "Overview" → {t('topbar.overview')}
// DashTab labels:
<DashTab to="/dashboard" end label={t('topbar.main')} />
<DashTab to="/dashboard/kernels" label={t('topbar.kernels')} />
<DashTab to="/dashboard/logs" label={t('topbar.logs')} />
```

- [ ] **Step 6: Wire ActiveJobsStrip.tsx**

```tsx
import { useTranslation } from 'react-i18next'

// Inside ActiveJobsStrip():
const { t } = useTranslation('nav')

// Replace strings:
// "LuminaDev Engine: Connected" → {t('engineConnected')}
// "Ready." → {t('ready')}
// "STOP" → {t('stop')}
// Job count: active.length > 1 ? t('jobs.count', { count: active.length }) : ''
```

Also add `data-ltr` to the version string and job kind (technical content):
```tsx
<span data-ltr style={{ fontWeight: 500 }}>{t('engineConnected')}</span>
// version stays LTR:
<span data-ltr>v0.2.0-alpha</span>
// job kind is technical (internal API name), keep LTR:
<span data-ltr>{firstActive.kind.replace(/_/g, ' ')}</span>
// progress percentage stays LTR:
<span data-numeric>({Math.min(100, Math.max(0, firstActive.progress ?? 0))}%)</span>
```

- [ ] **Step 7: Run smoke test**

```bash
cd apps/desktop && pnpm exec vitest run src/renderer/src/__tests__/i18n.smoke.test.ts
```

Expected: PASS.

- [ ] **Step 8: Typecheck**

```bash
cd apps/desktop && pnpm typecheck
```

Expected: no errors.

---

### Task 10: Update SettingsLanguages + enable de-DE + delete translations.ts — commit Phase 1

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/settings/SettingsLanguages.tsx`
- Delete: `apps/desktop/src/renderer/src/i18n/translations.ts`

- [ ] **Step 1: Read SettingsLanguages.tsx to find all strings and current imports**

```bash
cat apps/desktop/src/renderer/src/pages/settings/SettingsLanguages.tsx
```

- [ ] **Step 2: Add settings strings to en-US/settings.json**

Typical SettingsLanguages strings (adjust to match what you find in step 1):

`en-US/settings.json`:
```json
{
  "languages.title": "Languages",
  "languages.displayLanguage": "Display language",
  "languages.save": "Save",
  "languages.saved": "Saved.",
  "languages.english": "English",
  "languages.german": "German",
  "languages.arabic": "Arabic (Beta)",
  "languages.restartNote": "Language change takes effect immediately."
}
```

`de-DE/settings.json`:
```json
{
  "languages.title": "Sprachen",
  "languages.displayLanguage": "Anzeigesprache",
  "languages.save": "Speichern",
  "languages.saved": "Gespeichert.",
  "languages.english": "Englisch",
  "languages.german": "Deutsch",
  "languages.arabic": "Arabisch (Beta)",
  "languages.restartNote": "Sprachänderung tritt sofort in Kraft."
}
```

`ar-SA/settings.json`:
```json
{
  "languages.title": "اللغات",
  "languages.displayLanguage": "لغة العرض",
  "languages.save": "حفظ",
  "languages.saved": "تم الحفظ.",
  "languages.english": "الإنجليزية",
  "languages.german": "الألمانية",
  "languages.arabic": "العربية (تجريبي)",
  "languages.restartNote": "يسري تغيير اللغة فوراً."
}
```

- [ ] **Step 3: Rewrite SettingsLanguages.tsx**

Replace all imports from `../i18n/translations` and old `useTranslation` with:

```tsx
import { useTranslation } from 'react-i18next'
import { useI18nBridge } from '../../i18n/I18nContext'
import { useBetaFeatures } from '../../hooks/useBetaFeatures'
```

Inside the component:
```tsx
const { t } = useTranslation('settings')
const { setLocale } = useI18nBridge()
const { features } = useBetaFeatures()

// Language options:
const languages = [
  { value: 'en-US', label: t('languages.english') },
  { value: 'de-DE', label: t('languages.german') },
  ...(features.rtl_arabic ? [{ value: 'ar-SA', label: t('languages.arabic') }] : []),
]

// On save: call setLocale(selectedLocale) — this handles changeLanguage + DOM + store persist
```

Replace all hardcoded strings with `t('settings:languages.*')` calls.

- [ ] **Step 4: Delete translations.ts**

```bash
rm apps/desktop/src/renderer/src/i18n/translations.ts
```

- [ ] **Step 5: Fix any remaining imports**

```bash
cd apps/desktop && pnpm typecheck 2>&1 | grep translations
```

Fix any files still importing from `translations.ts`. After this step there should be zero.

- [ ] **Step 6: Run full test + typecheck**

```bash
cd apps/desktop && pnpm typecheck && pnpm exec vitest run src/renderer/src/__tests__/i18n.smoke.test.ts
```

Expected: all pass.

- [ ] **Step 7: Commit Phase 1**

```bash
git add -p  # stage all i18n Phase 1 changes
git commit -m "feat(i18n): Phase 1 — install react-i18next, init, common+nav namespaces, RTL bridge"
```

---

## Phase 2 — Per-File Loop

**Per-file protocol for every task in Phase 2:**

1. Read the file(s), extract every hardcoded UI string (ignore: container names, file paths, port numbers, terminal output, version strings, internal API enum values like `"running"`)
2. Add keys to namespace JSON for all 3 languages in one pass
3. Replace strings with `t('ns:key')` or `t('ns:key', { var })` for interpolation
4. Add `data-ltr` to technical-content blocks (code, paths, IDs, terminal output); add `data-numeric` to inline numbers in prose
5. Run typecheck: `cd apps/desktop && pnpm typecheck`
6. Run smoke test: `pnpm exec vitest run src/renderer/src/__tests__/i18n.smoke.test.ts`
7. Commit: `feat(i18n): wire <page> translations`

**Key naming convention:** `noun.verb` or `noun.label` — dot-separated, camelCase leaf. Example: `container.start`, `image.pull`, `error.daemonDown`, `status.running`. No snake_case, no abbreviations.

**Interpolation pattern:**
```json
{ "container.started": "Container {{name}} started" }
```
```tsx
t('docker:container.started', { name: container.name })
```
Never use string concatenation. Never `t('docker:container.started') + container.name`.

**Dynamic enum pattern (container states, job states):**
```tsx
// en-US/common.json already has status.* keys (Task 8)
t(`common:status.${container.State.Status}`)
```

---

### Task 11: DockerPage.tsx (namespace: docker)

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/DockerPage.tsx`
- Modify: all 3 `docker.json` locale files

DockerPage is 2,622 lines — highest string density. Extract methodically: work through each section (daemon control, containers tab, images tab, volumes tab, networks tab, compose tab) and collect all visible UI strings before writing keys.

- [ ] **Step 1: Extract all UI strings**

Read DockerPage.tsx in full. Build a list of every string literal that appears in JSX or as UI text. Skip: `container.Names[0]`, port numbers, image IDs, container IDs, error `[ERROR_CODE]` prefixes.

Typical strings to expect:
- Section headings: "Containers", "Images", "Volumes", "Networks", "Compose"
- Buttons: "Start", "Stop", "Remove", "Pull Image", "Prune", "Run", "Inspect"
- Status labels: "Running", "Stopped", "Exited" → these use `common:status.*`, not docker namespace
- Error messages: "Docker daemon is not running", "Failed to connect", "No containers found"
- Labels: "Name", "Status", "Image", "Created", "Ports", "Size", "Tag"
- Placeholders: "Search containers...", "Image name", "Tag (optional)"
- Confirmations: "Remove container?", "This action cannot be undone."

- [ ] **Step 2: Write docker.json for all 3 locales**

Start with EN, then DE, then AR. Follow the key naming convention. Example structure:

`en-US/docker.json` (fill in all strings you found in step 1):
```json
{
  "tab.containers": "Containers",
  "tab.images": "Images",
  "tab.volumes": "Volumes",
  "tab.networks": "Networks",
  "tab.compose": "Compose",
  "container.start": "Start",
  "container.stop": "Stop",
  "container.remove": "Remove",
  "container.inspect": "Inspect",
  "container.stopAll": "Stop All",
  "container.removeAll": "Remove All",
  "container.search": "Search containers...",
  "container.none": "No containers found.",
  "container.confirmRemove": "Remove container?",
  "container.confirmRemoveMsg": "This action cannot be undone.",
  "image.pull": "Pull Image",
  "image.remove": "Remove",
  "image.prune": "Prune Unused",
  "image.nameLabel": "Image name",
  "image.tagLabel": "Tag (optional)",
  "image.none": "No images found.",
  "volume.prune": "Prune Unused",
  "volume.none": "No volumes found.",
  "network.none": "No networks found.",
  "compose.up": "Up",
  "compose.down": "Down",
  "compose.logs": "Logs",
  "error.daemonDown": "Docker daemon is not running.",
  "error.connect": "Failed to connect to Docker.",
  "label.name": "Name",
  "label.status": "Status",
  "label.image": "Image",
  "label.created": "Created",
  "label.ports": "Ports",
  "label.size": "Size",
  "label.tag": "Tag",
  "label.id": "ID"
}
```

`de-DE/docker.json`:
```json
{
  "tab.containers": "Container",
  "tab.images": "Images",
  "tab.volumes": "Volumes",
  "tab.networks": "Netzwerke",
  "tab.compose": "Compose",
  "container.start": "Starten",
  "container.stop": "Stoppen",
  "container.remove": "Entfernen",
  "container.inspect": "Inspizieren",
  "container.stopAll": "Alle stoppen",
  "container.removeAll": "Alle entfernen",
  "container.search": "Container suchen...",
  "container.none": "Keine Container gefunden.",
  "container.confirmRemove": "Container entfernen?",
  "container.confirmRemoveMsg": "Diese Aktion kann nicht rückgängig gemacht werden.",
  "image.pull": "Image laden",
  "image.remove": "Entfernen",
  "image.prune": "Ungenutzte bereinigen",
  "image.nameLabel": "Image-Name",
  "image.tagLabel": "Tag (optional)",
  "image.none": "Keine Images gefunden.",
  "volume.prune": "Ungenutzte bereinigen",
  "volume.none": "Keine Volumes gefunden.",
  "network.none": "Keine Netzwerke gefunden.",
  "compose.up": "Starten",
  "compose.down": "Stoppen",
  "compose.logs": "Protokolle",
  "error.daemonDown": "Docker-Daemon läuft nicht.",
  "error.connect": "Verbindung zu Docker fehlgeschlagen.",
  "label.name": "Name",
  "label.status": "Status",
  "label.image": "Image",
  "label.created": "Erstellt",
  "label.ports": "Ports",
  "label.size": "Größe",
  "label.tag": "Tag",
  "label.id": "ID"
}
```

`ar-SA/docker.json`:
```json
{
  "tab.containers": "الحاويات",
  "tab.images": "الصور",
  "tab.volumes": "المجلدات",
  "tab.networks": "الشبكات",
  "tab.compose": "Compose",
  "container.start": "تشغيل",
  "container.stop": "إيقاف",
  "container.remove": "إزالة",
  "container.inspect": "فحص",
  "container.stopAll": "إيقاف الكل",
  "container.removeAll": "إزالة الكل",
  "container.search": "بحث في الحاويات...",
  "container.none": "لا توجد حاويات.",
  "container.confirmRemove": "إزالة الحاوية؟",
  "container.confirmRemoveMsg": "لا يمكن التراجع عن هذا الإجراء.",
  "image.pull": "تحميل الصورة",
  "image.remove": "إزالة",
  "image.prune": "حذف غير المستخدم",
  "image.nameLabel": "اسم الصورة",
  "image.tagLabel": "العلامة (اختياري)",
  "image.none": "لا توجد صور.",
  "volume.prune": "حذف غير المستخدم",
  "volume.none": "لا توجد مجلدات.",
  "network.none": "لا توجد شبكات.",
  "compose.up": "تشغيل",
  "compose.down": "إيقاف",
  "compose.logs": "السجلات",
  "error.daemonDown": "خادم Docker لا يعمل.",
  "error.connect": "فشل الاتصال بـ Docker.",
  "label.name": "الاسم",
  "label.status": "الحالة",
  "label.image": "الصورة",
  "label.created": "تاريخ الإنشاء",
  "label.ports": "المنافذ",
  "label.size": "الحجم",
  "label.tag": "العلامة",
  "label.id": "المعرّف"
}
```

- [ ] **Step 3: Wire t() in DockerPage.tsx**

Add at top of component:
```tsx
import { useTranslation } from 'react-i18next'
const { t } = useTranslation('docker')
```

Replace every string literal with `t('docker:...')`. Add `data-ltr` to container IDs, image digests, port numbers in table cells, and any `<code>` or `<pre>` blocks.

Container state labels come from `common:status.*`:
```tsx
// Instead of container.State.Status directly:
t(`common:status.${container.State.Status}`, { defaultValue: container.State.Status })
```

- [ ] **Step 4: Run protocol steps 5–7**

```bash
cd apps/desktop && pnpm typecheck && pnpm exec vitest run src/renderer/src/__tests__/i18n.smoke.test.ts
git commit -m "feat(i18n): wire DockerPage translations"
```

---

### Task 12: DeveloperGitPage.tsx + all gitVcs* sub-components (namespace: git) — one commit

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/DeveloperGitPage.tsx`
- Modify: all `gitVcs*.tsx` files in the git pages directory
- Modify: all 3 `git.json` locale files

- [ ] **Step 1: List all gitVcs files**

```bash
find apps/desktop/src/renderer/src -name 'gitVcs*.tsx' -o -name 'DeveloperGitPage.tsx' | sort
```

- [ ] **Step 2: Extract all UI strings from all files in one pass**

Read each file. Strings to expect:
- Branch, commit, push, pull, fetch, merge labels
- "No commits", "No branches", "Uncommitted changes"
- Status indicators: "Ahead", "Behind", "Up to date", "Diverged"
- Button labels: "Commit", "Push", "Pull", "Fetch", "Stash", "Clone"
- Field labels: "Message", "Branch name", "Remote URL", "Author"
- Error messages for failed git operations

- [ ] **Step 3: Write git.json for all 3 locales**

Follow the same EN → DE → AR pattern as Task 11. Key examples:

`en-US/git.json`:
```json
{
  "tab.vcs": "Version Control",
  "tab.config": "Config",
  "tab.cloud": "Cloud",
  "action.commit": "Commit",
  "action.push": "Push",
  "action.pull": "Pull",
  "action.fetch": "Fetch",
  "action.stash": "Stash",
  "action.clone": "Clone",
  "action.merge": "Merge",
  "action.branch": "New Branch",
  "label.message": "Commit message",
  "label.branch": "Branch",
  "label.remote": "Remote URL",
  "label.author": "Author",
  "label.ahead": "Ahead",
  "label.behind": "Behind",
  "status.upToDate": "Up to date",
  "status.diverged": "Diverged",
  "noCommits": "No commits yet.",
  "noBranches": "No branches found.",
  "uncommitted": "Uncommitted changes",
  "error.notRepo": "Not a Git repository.",
  "error.pushFailed": "Push failed.",
  "error.pullFailed": "Pull failed."
}
```

`de-DE/git.json`:
```json
{
  "tab.vcs": "Versionskontrolle",
  "tab.config": "Konfiguration",
  "tab.cloud": "Cloud",
  "action.commit": "Commit",
  "action.push": "Push",
  "action.pull": "Pull",
  "action.fetch": "Abrufen",
  "action.stash": "Stash",
  "action.clone": "Klonen",
  "action.merge": "Zusammenführen",
  "action.branch": "Neuer Branch",
  "label.message": "Commit-Nachricht",
  "label.branch": "Branch",
  "label.remote": "Remote-URL",
  "label.author": "Autor",
  "label.ahead": "Voraus",
  "label.behind": "Hinterher",
  "status.upToDate": "Aktuell",
  "status.diverged": "Abgewichen",
  "noCommits": "Noch keine Commits.",
  "noBranches": "Keine Branches gefunden.",
  "uncommitted": "Ungespeicherte Änderungen",
  "error.notRepo": "Kein Git-Repository.",
  "error.pushFailed": "Push fehlgeschlagen.",
  "error.pullFailed": "Pull fehlgeschlagen."
}
```

`ar-SA/git.json`:
```json
{
  "tab.vcs": "التحكم بالإصدار",
  "tab.config": "الإعداد",
  "tab.cloud": "السحابة",
  "action.commit": "إيداع",
  "action.push": "رفع",
  "action.pull": "سحب",
  "action.fetch": "جلب",
  "action.stash": "تخزين مؤقت",
  "action.clone": "نسخ",
  "action.merge": "دمج",
  "action.branch": "فرع جديد",
  "label.message": "رسالة الإيداع",
  "label.branch": "الفرع",
  "label.remote": "رابط المستودع البعيد",
  "label.author": "المؤلف",
  "label.ahead": "متقدم",
  "label.behind": "متأخر",
  "status.upToDate": "محدّث",
  "status.diverged": "متشعب",
  "noCommits": "لا توجد إيداعات بعد.",
  "noBranches": "لا توجد فروع.",
  "uncommitted": "تغييرات غير محفوظة",
  "error.notRepo": "ليس مستودع Git.",
  "error.pushFailed": "فشل الرفع.",
  "error.pullFailed": "فشل السحب."
}
```

- [ ] **Step 4: Wire t() in all gitVcs files and DeveloperGitPage**

File paths, branch names, remote URLs, commit hashes → wrap in `data-ltr`. Diff output → `data-ltr` on the containing element.

- [ ] **Step 5: Run protocol steps 5–7**

```bash
cd apps/desktop && pnpm typecheck && pnpm exec vitest run src/renderer/src/__tests__/i18n.smoke.test.ts
git commit -m "feat(i18n): wire DeveloperGitPage and gitVcs sub-components translations"
```

---

### Task 13: GitConfigPage.tsx (namespace: git)

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/GitConfigPage.tsx`
- Modify: all 3 `git.json` locale files (add keys)

- [ ] **Step 1: Extract strings from GitConfigPage.tsx**

```bash
grep -n '"[A-Z][^"]*"' apps/desktop/src/renderer/src/pages/GitConfigPage.tsx | head -40
```

- [ ] **Step 2: Add git.json keys for config section**

Add to existing git.json files. Example new keys:

`en-US` additions:
```json
{
  "config.title": "Git Configuration",
  "config.globalName": "Global user name",
  "config.globalEmail": "Global email",
  "config.defaultBranch": "Default branch",
  "config.editor": "Editor",
  "config.save": "Save Configuration",
  "config.saved": "Configuration saved."
}
```

Mirror to de-DE and ar-SA.

- [ ] **Step 3: Wire t() in GitConfigPage.tsx**

Config values (names, emails, branch names) are user data — do NOT translate. Label strings get `t()`. Config file paths → `data-ltr`.

- [ ] **Step 4: Run protocol steps 5–7**

```bash
cd apps/desktop && pnpm typecheck && pnpm exec vitest run src/renderer/src/__tests__/i18n.smoke.test.ts
git commit -m "feat(i18n): wire GitConfigPage translations"
```

---

### Task 14: CloudGitPage.tsx + CloudGitActivityPanel.tsx (namespace: git)

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/CloudGitPage.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/CloudGitActivityPanel.tsx` (or wherever it lives)
- Modify: all 3 `git.json` locale files

- [ ] **Step 1: Find the files**

```bash
find apps/desktop/src/renderer/src -name 'CloudGit*.tsx' | sort
```

- [ ] **Step 2: Extract strings + add git.json keys**

Typical strings:
```json
{
  "cloud.title": "Cloud Git",
  "cloud.connect": "Connect",
  "cloud.disconnect": "Disconnect",
  "cloud.provider": "Provider",
  "cloud.repo": "Repository",
  "cloud.activity": "Activity",
  "cloud.noActivity": "No recent activity.",
  "cloud.syncNow": "Sync Now",
  "cloud.lastSync": "Last synced"
}
```

Mirror to de-DE and ar-SA.

- [ ] **Step 3: Wire t(), add data-ltr to repo URLs and org/repo names**

- [ ] **Step 4: Run protocol steps 5–7**

```bash
cd apps/desktop && pnpm typecheck && pnpm exec vitest run src/renderer/src/__tests__/i18n.smoke.test.ts
git commit -m "feat(i18n): wire CloudGitPage and CloudGitActivityPanel translations"
```

---

### Task 15: RuntimesPage.tsx (namespace: runtimes)

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/RuntimesPage.tsx`
- Modify: all 3 `runtimes.json` locale files

- [ ] **Step 1: Extract strings**

```bash
grep -n '"[A-Z][^"]*"' apps/desktop/src/renderer/src/pages/RuntimesPage.tsx | head -50
```

- [ ] **Step 2: Write runtimes.json for all 3 locales**

`en-US/runtimes.json`:
```json
{
  "title": "Runtimes",
  "install": "Install",
  "uninstall": "Uninstall",
  "installed": "Installed",
  "notInstalled": "Not installed",
  "checkDeps": "Check Dependencies",
  "checking": "Checking...",
  "version": "Version",
  "noRuntimes": "No runtimes configured.",
  "error.installFailed": "Installation failed.",
  "error.checkFailed": "Dependency check failed."
}
```

`de-DE/runtimes.json`:
```json
{
  "title": "Laufzeitumgebungen",
  "install": "Installieren",
  "uninstall": "Deinstallieren",
  "installed": "Installiert",
  "notInstalled": "Nicht installiert",
  "checkDeps": "Abhängigkeiten prüfen",
  "checking": "Prüfe...",
  "version": "Version",
  "noRuntimes": "Keine Laufzeitumgebungen konfiguriert.",
  "error.installFailed": "Installation fehlgeschlagen.",
  "error.checkFailed": "Abhängigkeitsprüfung fehlgeschlagen."
}
```

`ar-SA/runtimes.json`:
```json
{
  "title": "بيئات التشغيل",
  "install": "تثبيت",
  "uninstall": "إزالة التثبيت",
  "installed": "مثبّت",
  "notInstalled": "غير مثبّت",
  "checkDeps": "فحص المتطلبات",
  "checking": "جاري الفحص...",
  "version": "الإصدار",
  "noRuntimes": "لا توجد بيئات تشغيل مضبوطة.",
  "error.installFailed": "فشل التثبيت.",
  "error.checkFailed": "فشل فحص المتطلبات."
}
```

- [ ] **Step 3: Wire t() in RuntimesPage.tsx**

Runtime health status → `t(\`common:status.${runtime.health}\`)`. Version strings → `data-ltr`.

- [ ] **Step 4: Run protocol steps 5–7**

```bash
cd apps/desktop && pnpm typecheck && pnpm exec vitest run src/renderer/src/__tests__/i18n.smoke.test.ts
git commit -m "feat(i18n): wire RuntimesPage translations"
```

---

### Task 16: DashboardMainPage + DashboardKernelsPage + DashboardLogsPage (namespace: dashboard)

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/DashboardMainPage.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/DashboardKernelsPage.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/DashboardLogsPage.tsx`
- Modify: all dashboard widget components
- Modify: all 3 `dashboard.json` locale files

- [ ] **Step 1: Find all dashboard files**

```bash
find apps/desktop/src/renderer/src -path '*/pages/Dashboard*' -o -path '*/dashboard/*' | sort
```

- [ ] **Step 2: Extract strings and write dashboard.json**

`en-US/dashboard.json`:
```json
{
  "welcome": "Welcome",
  "kernels.title": "Kernels",
  "kernels.none": "No kernels running.",
  "logs.title": "Logs",
  "logs.clear": "Clear",
  "logs.noLogs": "No log entries.",
  "logs.filter": "Filter logs...",
  "widget.cpu": "CPU",
  "widget.memory": "Memory",
  "widget.disk": "Disk",
  "widget.network": "Network",
  "widget.uptime": "Uptime",
  "widget.noData": "No data available."
}
```

`de-DE/dashboard.json`:
```json
{
  "welcome": "Willkommen",
  "kernels.title": "Kernel",
  "kernels.none": "Keine Kernel aktiv.",
  "logs.title": "Protokolle",
  "logs.clear": "Löschen",
  "logs.noLogs": "Keine Protokolleinträge.",
  "logs.filter": "Protokolle filtern...",
  "widget.cpu": "CPU",
  "widget.memory": "Arbeitsspeicher",
  "widget.disk": "Festplatte",
  "widget.network": "Netzwerk",
  "widget.uptime": "Laufzeit",
  "widget.noData": "Keine Daten verfügbar."
}
```

`ar-SA/dashboard.json`:
```json
{
  "welcome": "مرحباً",
  "kernels.title": "النوى",
  "kernels.none": "لا توجد نوى تعمل.",
  "logs.title": "السجلات",
  "logs.clear": "مسح",
  "logs.noLogs": "لا توجد إدخالات في السجل.",
  "logs.filter": "تصفية السجلات...",
  "widget.cpu": "المعالج",
  "widget.memory": "الذاكرة",
  "widget.disk": "القرص",
  "widget.network": "الشبكة",
  "widget.uptime": "وقت التشغيل",
  "widget.noData": "لا توجد بيانات."
}
```

- [ ] **Step 3: Wire t() in all dashboard files**

CPU%, RAM MB, disk GB → `data-numeric`. Log content → `data-ltr`. File paths in logs → `data-ltr`.

- [ ] **Step 4: Run protocol steps 5–7**

```bash
cd apps/desktop && pnpm typecheck && pnpm exec vitest run src/renderer/src/__tests__/i18n.smoke.test.ts
git commit -m "feat(i18n): wire Dashboard pages translations"
```

---

### Task 17: MonitorPage + SystemPage (namespace: monitor)

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/MonitorPage.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/SystemPage.tsx`
- Modify: all 3 `monitor.json` locale files

- [ ] **Step 1: Extract strings**

```bash
grep -n '"[A-Z][^"]*"' apps/desktop/src/renderer/src/pages/MonitorPage.tsx apps/desktop/src/renderer/src/pages/SystemPage.tsx | head -60
```

- [ ] **Step 2: Write monitor.json for all 3 locales**

`en-US/monitor.json`:
```json
{
  "title": "System Monitor",
  "cpu.title": "CPU Usage",
  "memory.title": "Memory",
  "disk.title": "Disk",
  "network.title": "Network",
  "processes.title": "Processes",
  "processes.name": "Name",
  "processes.pid": "PID",
  "processes.cpu": "CPU",
  "processes.memory": "Memory",
  "processes.none": "No processes found.",
  "system.title": "System Info",
  "system.os": "Operating System",
  "system.kernel": "Kernel",
  "system.hostname": "Hostname",
  "system.uptime": "Uptime",
  "system.arch": "Architecture"
}
```

`de-DE/monitor.json`:
```json
{
  "title": "Systemmonitor",
  "cpu.title": "CPU-Auslastung",
  "memory.title": "Arbeitsspeicher",
  "disk.title": "Festplatte",
  "network.title": "Netzwerk",
  "processes.title": "Prozesse",
  "processes.name": "Name",
  "processes.pid": "PID",
  "processes.cpu": "CPU",
  "processes.memory": "Speicher",
  "processes.none": "Keine Prozesse gefunden.",
  "system.title": "Systeminformationen",
  "system.os": "Betriebssystem",
  "system.kernel": "Kernel",
  "system.hostname": "Hostname",
  "system.uptime": "Laufzeit",
  "system.arch": "Architektur"
}
```

`ar-SA/monitor.json`:
```json
{
  "title": "مراقب النظام",
  "cpu.title": "استخدام المعالج",
  "memory.title": "الذاكرة",
  "disk.title": "القرص",
  "network.title": "الشبكة",
  "processes.title": "العمليات",
  "processes.name": "الاسم",
  "processes.pid": "PID",
  "processes.cpu": "المعالج",
  "processes.memory": "الذاكرة",
  "processes.none": "لا توجد عمليات.",
  "system.title": "معلومات النظام",
  "system.os": "نظام التشغيل",
  "system.kernel": "النواة",
  "system.hostname": "اسم المضيف",
  "system.uptime": "وقت التشغيل",
  "system.arch": "البنية"
}
```

- [ ] **Step 3: Wire t() in MonitorPage.tsx and SystemPage.tsx**

Process names, PID values, hostname, kernel version → `data-ltr`. CPU%, RAM values → `data-numeric`. OS name → `data-ltr`.

- [ ] **Step 4: Run protocol steps 5–7**

```bash
cd apps/desktop && pnpm typecheck && pnpm exec vitest run src/renderer/src/__tests__/i18n.smoke.test.ts
git commit -m "feat(i18n): wire MonitorPage and SystemPage translations"
```

---

### Task 18: MaintenancePage.tsx (namespace: maintenance)

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/MaintenancePage.tsx`
- Modify: all 3 `maintenance.json` locale files

- [ ] **Step 1: Extract strings + write maintenance.json**

`en-US/maintenance.json`:
```json
{
  "title": "Maintenance",
  "prune.docker": "Prune Docker Resources",
  "prune.docker.desc": "Remove stopped containers, dangling images, unused volumes.",
  "prune.run": "Run Prune",
  "prune.running": "Pruning...",
  "prune.done": "Prune complete.",
  "clear.logs": "Clear Application Logs",
  "clear.logs.desc": "Delete local log files.",
  "clear.run": "Clear Logs",
  "system.update": "System Update Check",
  "system.update.run": "Check Now"
}
```

`de-DE/maintenance.json`:
```json
{
  "title": "Wartung",
  "prune.docker": "Docker-Ressourcen bereinigen",
  "prune.docker.desc": "Gestoppte Container, ungenutzte Images und Volumes entfernen.",
  "prune.run": "Bereinigen starten",
  "prune.running": "Bereinige...",
  "prune.done": "Bereinigung abgeschlossen.",
  "clear.logs": "Anwendungsprotokolle löschen",
  "clear.logs.desc": "Lokale Protokolldateien löschen.",
  "clear.run": "Protokolle löschen",
  "system.update": "Systemaktualisierung prüfen",
  "system.update.run": "Jetzt prüfen"
}
```

`ar-SA/maintenance.json`:
```json
{
  "title": "الصيانة",
  "prune.docker": "تنظيف موارد Docker",
  "prune.docker.desc": "إزالة الحاويات المتوقفة والصور غير المستخدمة والمجلدات.",
  "prune.run": "تشغيل التنظيف",
  "prune.running": "جاري التنظيف...",
  "prune.done": "اكتمل التنظيف.",
  "clear.logs": "مسح سجلات التطبيق",
  "clear.logs.desc": "حذف ملفات السجل المحلية.",
  "clear.run": "مسح السجلات",
  "system.update": "فحص تحديثات النظام",
  "system.update.run": "فحص الآن"
}
```

- [ ] **Step 2: Wire t() + run protocol steps 5–7**

```bash
cd apps/desktop && pnpm typecheck && pnpm exec vitest run src/renderer/src/__tests__/i18n.smoke.test.ts
git commit -m "feat(i18n): wire MaintenancePage translations"
```

---

### Task 19: SshPage.tsx (namespace: ssh)

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/SshPage.tsx`
- Modify: all 3 `ssh.json` locale files

- [ ] **Step 1: Extract strings + write ssh.json**

`en-US/ssh.json`:
```json
{
  "title": "SSH",
  "bookmarks.title": "SSH Bookmarks",
  "bookmarks.add": "Add Bookmark",
  "bookmarks.none": "No bookmarks saved.",
  "bookmark.name": "Name",
  "bookmark.host": "Host",
  "bookmark.port": "Port",
  "bookmark.user": "Username",
  "bookmark.connect": "Connect",
  "bookmark.remove": "Remove",
  "keygen.title": "Key Management",
  "keygen.generate": "Generate Key Pair",
  "keygen.type": "Key type",
  "keygen.comment": "Comment",
  "keygen.generate.run": "Generate",
  "error.connectFailed": "SSH connection failed."
}
```

`de-DE/ssh.json`:
```json
{
  "title": "SSH",
  "bookmarks.title": "SSH-Lesezeichen",
  "bookmarks.add": "Lesezeichen hinzufügen",
  "bookmarks.none": "Keine Lesezeichen gespeichert.",
  "bookmark.name": "Name",
  "bookmark.host": "Host",
  "bookmark.port": "Port",
  "bookmark.user": "Benutzername",
  "bookmark.connect": "Verbinden",
  "bookmark.remove": "Entfernen",
  "keygen.title": "Schlüsselverwaltung",
  "keygen.generate": "Schlüsselpaar generieren",
  "keygen.type": "Schlüsseltyp",
  "keygen.comment": "Kommentar",
  "keygen.generate.run": "Generieren",
  "error.connectFailed": "SSH-Verbindung fehlgeschlagen."
}
```

`ar-SA/ssh.json`:
```json
{
  "title": "SSH",
  "bookmarks.title": "إشارات SSH",
  "bookmarks.add": "إضافة إشارة",
  "bookmarks.none": "لا توجد إشارات محفوظة.",
  "bookmark.name": "الاسم",
  "bookmark.host": "المضيف",
  "bookmark.port": "المنفذ",
  "bookmark.user": "اسم المستخدم",
  "bookmark.connect": "اتصال",
  "bookmark.remove": "إزالة",
  "keygen.title": "إدارة المفاتيح",
  "keygen.generate": "إنشاء زوج مفاتيح",
  "keygen.type": "نوع المفتاح",
  "keygen.comment": "تعليق",
  "keygen.generate.run": "إنشاء",
  "error.connectFailed": "فشل اتصال SSH."
}
```

- [ ] **Step 2: Wire t() + data-ltr for hostname, username, port, key paths**

```bash
cd apps/desktop && pnpm typecheck && pnpm exec vitest run src/renderer/src/__tests__/i18n.smoke.test.ts
git commit -m "feat(i18n): wire SshPage translations"
```

---

### Task 20: ProfilesPage.tsx (namespace: profiles)

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/ProfilesPage.tsx`
- Modify: all 3 `profiles.json` locale files

- [ ] **Step 1: Extract strings + write profiles.json**

`en-US/profiles.json`:
```json
{
  "title": "Profiles",
  "create": "Create Profile",
  "delete": "Delete Profile",
  "active": "Active",
  "switch": "Switch to",
  "name": "Profile name",
  "none": "No profiles found.",
  "default": "Default",
  "confirmDelete": "Delete this profile?",
  "confirmDeleteMsg": "All associated settings will be removed."
}
```

`de-DE/profiles.json`:
```json
{
  "title": "Profile",
  "create": "Profil erstellen",
  "delete": "Profil löschen",
  "active": "Aktiv",
  "switch": "Wechseln zu",
  "name": "Profilname",
  "none": "Keine Profile gefunden.",
  "default": "Standard",
  "confirmDelete": "Dieses Profil löschen?",
  "confirmDeleteMsg": "Alle zugehörigen Einstellungen werden entfernt."
}
```

`ar-SA/profiles.json`:
```json
{
  "title": "الملفات الشخصية",
  "create": "إنشاء ملف شخصي",
  "delete": "حذف الملف الشخصي",
  "active": "نشط",
  "switch": "التبديل إلى",
  "name": "اسم الملف الشخصي",
  "none": "لا توجد ملفات شخصية.",
  "default": "افتراضي",
  "confirmDelete": "حذف هذا الملف الشخصي؟",
  "confirmDeleteMsg": "ستتم إزالة جميع الإعدادات المرتبطة."
}
```

- [ ] **Step 2: Wire t() + run protocol steps 5–7**

```bash
cd apps/desktop && pnpm typecheck && pnpm exec vitest run src/renderer/src/__tests__/i18n.smoke.test.ts
git commit -m "feat(i18n): wire ProfilesPage translations"
```

---

### Task 21: All 18 Settings*.tsx files (namespace: settings) — one commit

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/settings/SettingsAccounts.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/settings/SettingsAppEngine.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/settings/SettingsBetaFeatures.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/settings/SettingsBuilder.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/settings/SettingsDateTime.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/settings/SettingsExtension.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/settings/SettingsGeneral.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/settings/SettingsHelpAbout.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/settings/SettingsNotification.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/settings/SettingsPersonalization.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/settings/SettingsRemote.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/settings/SettingsResources.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/settings/SettingsShell.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/settings/SettingsShortcuts.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/settings/SettingsSystem.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/settings/SettingsUpdate.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/settings/SettingsLanguages.tsx` (already done in Task 10, just verify)
- Modify: all 3 `settings.json` locale files

- [ ] **Step 1: Extract all strings from all 18 Settings files in one pass**

```bash
for f in apps/desktop/src/renderer/src/pages/settings/Settings*.tsx; do
  echo "=== $f ==="; grep -n '"[A-Z][^"]*"' "$f" | head -20
done
```

- [ ] **Step 2: Write settings.json for all 3 locales**

Consolidate all settings strings. Already has `languages.*` keys from Task 10. Add:

`en-US/settings.json` additions:
```json
{
  "general.title": "General",
  "accounts.title": "Accounts",
  "update.title": "Software Update",
  "update.checkNow": "Check now",
  "update.checking": "Checking...",
  "update.releaseChannel": "Release channel",
  "update.stable": "Stable (recommended)",
  "update.alpha": "Alpha (early features, frequent updates)",
  "update.checkOnStartup": "Check for updates on app startup",
  "update.lastChecked": "Last checked",
  "update.neverChecked": "Never checked",
  "appEngine.title": "App Engine",
  "appEngine.ipcTimeout": "IPC timeout (ms)",
  "appEngine.threadPoolSize": "Thread pool size",
  "appEngine.daemonAutoRestart": "Daemon auto-restart",
  "notifications.title": "Notifications",
  "notifications.globalMute": "Global mute",
  "notifications.minSeverity": "Minimum severity",
  "notifications.osNotifications": "OS native notifications",
  "personalization.title": "Personalization",
  "personalization.accent": "Accent color",
  "personalization.theme": "Theme",
  "resources.title": "Resources",
  "resources.cpuLimit": "CPU limit",
  "resources.ramLimit": "RAM limit",
  "shell.title": "Shell",
  "shell.default": "Default shell",
  "shortcuts.title": "Shortcuts",
  "shortcuts.reset": "Reset to defaults",
  "beta.title": "Beta Features",
  "beta.enabled": "Enabled",
  "beta.disabled": "Disabled",
  "system.title": "System",
  "helpAbout.title": "Help & About",
  "helpAbout.version": "Version",
  "helpAbout.docs": "Documentation",
  "helpAbout.report": "Report an issue",
  "remote.title": "Remote",
  "extension.title": "Extensions",
  "builder.title": "Builder",
  "datetime.title": "Date & Time"
}
```

Mirror every key to `de-DE/settings.json` and `ar-SA/settings.json`.

`de-DE/settings.json` additions (sample — complete all keys):
```json
{
  "general.title": "Allgemein",
  "accounts.title": "Konten",
  "update.title": "Software-Update",
  "update.checkNow": "Jetzt prüfen",
  "update.checking": "Prüfe...",
  "update.releaseChannel": "Versionskanal",
  "update.stable": "Stabil (empfohlen)",
  "update.alpha": "Alpha (frühe Funktionen, häufige Updates)",
  "update.checkOnStartup": "Beim Start auf Updates prüfen",
  "update.lastChecked": "Zuletzt geprüft",
  "update.neverChecked": "Noch nie geprüft",
  "appEngine.title": "App-Engine",
  "appEngine.ipcTimeout": "IPC-Timeout (ms)",
  "appEngine.threadPoolSize": "Thread-Pool-Größe",
  "appEngine.daemonAutoRestart": "Daemon automatisch neu starten",
  "notifications.title": "Benachrichtigungen",
  "notifications.globalMute": "Global stumm schalten",
  "notifications.minSeverity": "Mindest-Schweregrad",
  "notifications.osNotifications": "Native OS-Benachrichtigungen",
  "personalization.title": "Personalisierung",
  "personalization.accent": "Akzentfarbe",
  "personalization.theme": "Design",
  "resources.title": "Ressourcen",
  "resources.cpuLimit": "CPU-Limit",
  "resources.ramLimit": "RAM-Limit",
  "shell.title": "Shell",
  "shell.default": "Standard-Shell",
  "shortcuts.title": "Tastenkombinationen",
  "shortcuts.reset": "Auf Standard zurücksetzen",
  "beta.title": "Beta-Funktionen",
  "beta.enabled": "Aktiviert",
  "beta.disabled": "Deaktiviert",
  "system.title": "System",
  "helpAbout.title": "Hilfe & Über",
  "helpAbout.version": "Version",
  "helpAbout.docs": "Dokumentation",
  "helpAbout.report": "Problem melden",
  "remote.title": "Remote",
  "extension.title": "Erweiterungen",
  "builder.title": "Builder",
  "datetime.title": "Datum & Uhrzeit"
}
```

`ar-SA/settings.json` additions:
```json
{
  "general.title": "عام",
  "accounts.title": "الحسابات",
  "update.title": "تحديث البرنامج",
  "update.checkNow": "تحقق الآن",
  "update.checking": "جاري التحقق...",
  "update.releaseChannel": "قناة الإصدار",
  "update.stable": "مستقر (موصى به)",
  "update.alpha": "ألفا (ميزات مبكرة، تحديثات متكررة)",
  "update.checkOnStartup": "تحقق من التحديثات عند بدء التطبيق",
  "update.lastChecked": "آخر تحقق",
  "update.neverChecked": "لم يتم التحقق أبداً",
  "appEngine.title": "محرك التطبيق",
  "appEngine.ipcTimeout": "مهلة IPC (مللي ثانية)",
  "appEngine.threadPoolSize": "حجم مجموعة الخيوط",
  "appEngine.daemonAutoRestart": "إعادة تشغيل البرنامج الخفي تلقائياً",
  "notifications.title": "الإشعارات",
  "notifications.globalMute": "كتم الصوت العام",
  "notifications.minSeverity": "الحد الأدنى للخطورة",
  "notifications.osNotifications": "إشعارات النظام الأصلية",
  "personalization.title": "التخصيص",
  "personalization.accent": "لون التمييز",
  "personalization.theme": "المظهر",
  "resources.title": "الموارد",
  "resources.cpuLimit": "حد المعالج",
  "resources.ramLimit": "حد الذاكرة",
  "shell.title": "الصدفة",
  "shell.default": "الصدفة الافتراضية",
  "shortcuts.title": "اختصارات لوحة المفاتيح",
  "shortcuts.reset": "إعادة تعيين إلى الافتراضي",
  "beta.title": "الميزات التجريبية",
  "beta.enabled": "مفعّل",
  "beta.disabled": "معطّل",
  "system.title": "النظام",
  "helpAbout.title": "المساعدة والمعلومات",
  "helpAbout.version": "الإصدار",
  "helpAbout.docs": "التوثيق",
  "helpAbout.report": "الإبلاغ عن مشكلة",
  "remote.title": "عن بُعد",
  "extension.title": "الامتدادات",
  "builder.title": "المنشئ",
  "datetime.title": "التاريخ والوقت"
}
```

- [ ] **Step 3: Wire t() in all 18 Settings files**

Each settings page: `const { t } = useTranslation('settings')`. Replace all string literals. Version strings, shell path values → `data-ltr`. Numeric settings values → `data-numeric`.

- [ ] **Step 4: Run protocol steps 5–7**

```bash
cd apps/desktop && pnpm typecheck && pnpm exec vitest run src/renderer/src/__tests__/i18n.smoke.test.ts
git commit -m "feat(i18n): wire all Settings pages translations"
```

---

### Task 22: ReadinessWizardPage + SystemReadinessPage (namespace: readiness)

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/ReadinessWizardPage.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/SystemReadinessPage.tsx` (or wherever the readiness wizard lives)
- Modify: all 3 `readiness.json` locale files

- [ ] **Step 1: Find the files**

```bash
find apps/desktop/src/renderer/src -name '*Readiness*' -o -name '*Wizard*' | sort
```

- [ ] **Step 2: Extract strings + write readiness.json**

`en-US/readiness.json`:
```json
{
  "title": "System Readiness",
  "wizard.title": "Setup Wizard",
  "wizard.next": "Next",
  "wizard.back": "Back",
  "wizard.finish": "Finish",
  "wizard.skip": "Skip",
  "check.title": "Running checks...",
  "check.pass": "Pass",
  "check.fail": "Fail",
  "check.warning": "Warning",
  "check.docker": "Docker available",
  "check.git": "Git available",
  "check.ssh": "SSH configured",
  "check.internet": "Internet connectivity",
  "allPassed": "All checks passed.",
  "someFailed": "Some checks failed. Review and fix before continuing."
}
```

`de-DE/readiness.json`:
```json
{
  "title": "Systembereitschaft",
  "wizard.title": "Einrichtungsassistent",
  "wizard.next": "Weiter",
  "wizard.back": "Zurück",
  "wizard.finish": "Fertigstellen",
  "wizard.skip": "Überspringen",
  "check.title": "Prüfungen laufen...",
  "check.pass": "Bestanden",
  "check.fail": "Fehlgeschlagen",
  "check.warning": "Warnung",
  "check.docker": "Docker verfügbar",
  "check.git": "Git verfügbar",
  "check.ssh": "SSH konfiguriert",
  "check.internet": "Internetverbindung",
  "allPassed": "Alle Prüfungen bestanden.",
  "someFailed": "Einige Prüfungen fehlgeschlagen. Bitte vor dem Fortfahren beheben."
}
```

`ar-SA/readiness.json`:
```json
{
  "title": "جاهزية النظام",
  "wizard.title": "معالج الإعداد",
  "wizard.next": "التالي",
  "wizard.back": "السابق",
  "wizard.finish": "إنهاء",
  "wizard.skip": "تخطي",
  "check.title": "جاري التحقق...",
  "check.pass": "ناجح",
  "check.fail": "فاشل",
  "check.warning": "تحذير",
  "check.docker": "Docker متاح",
  "check.git": "Git متاح",
  "check.ssh": "SSH مضبوط",
  "check.internet": "اتصال بالإنترنت",
  "allPassed": "اجتازت جميع الفحوصات.",
  "someFailed": "فشلت بعض الفحوصات. يرجى الإصلاح قبل المتابعة."
}
```

- [ ] **Step 3: Wire t() + run protocol steps 5–7**

```bash
cd apps/desktop && pnpm typecheck && pnpm exec vitest run src/renderer/src/__tests__/i18n.smoke.test.ts
git commit -m "feat(i18n): wire ReadinessWizardPage and SystemReadinessPage translations"
```

---

### Task 23: TerminalPage.tsx — strings only, no translation of terminal output

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/TerminalPage.tsx` (or wherever the terminal page renders)
- Modify: `apps/desktop/src/renderer/src/i18n/locales/*/nav.json` (terminal UI strings belong to nav namespace, or common)

NOTE: Terminal output is untranslated — it is `data-ltr` output from the shell. Only translate the Chrome UI around the terminal (tab labels, status indicators, button tooltips).

- [ ] **Step 1: Find TerminalPage**

```bash
find apps/desktop/src/renderer/src -name 'TerminalPage.tsx' -o -name '*Terminal*.tsx' | grep -v test | sort
```

- [ ] **Step 2: Extract only the shell chrome strings**

Strings to translate: tab title ("Terminal"), "New Tab", "Close", "Clear", terminal status indicator.  
Strings to NOT translate: everything inside the `<xterm>` or terminal output area.

Add any new keys to `nav.json` (terminal chrome is nav-level UI):
```json
{
  "terminal.newTab": "New Tab",
  "terminal.close": "Close",
  "terminal.clear": "Clear"
}
```

Mirror to de-DE and ar-SA.

- [ ] **Step 3: Wire t() for chrome strings only**

The terminal output container must have `data-ltr` on its wrapper element.

- [ ] **Step 4: Run full suite**

```bash
cd apps/desktop && pnpm smoke
```

Expected: typecheck + all tests + lint pass.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(i18n): wire TerminalPage chrome translations — terminal output stays LTR"
```

---

## Final Verification

- [ ] **Switch to de-DE in settings — verify all UI labels in German, no raw key strings visible, no text overflow**

- [ ] **Switch to ar-SA (must enable `rtl_arabic` beta flag first) — verify Arabic text direction, code/paths/numbers remain LTR**

- [ ] **Switch back to en-US — no residual state**

- [ ] **Run full smoke gate**

```bash
cd apps/desktop && pnpm smoke
```

Expected: typecheck + all tests + lint all green.

- [ ] **Tag Phase 1 + Phase 2 complete**

```bash
git log --oneline -15  # verify commit chain looks clean
```
