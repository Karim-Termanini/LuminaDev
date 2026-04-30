# تقرير الوضع — LuminaDev (Tauri migration & release track)

مستند **لقطة** يُحدَّث عند تغيّر المسار بشكل جوهري. التفاصيل القانونية للمراحل: [`STABILIZATION_CHECKLIST.md`](./STABILIZATION_CHECKLIST.md). تسلسل المنتج والـ Flatpak/Electron: [`AGENT_WORK_PLAN.md`](./AGENT_WORK_PLAN.md)، [`phasesPlan.md`](../phasesPlan.md).

---

## Migration stages (من `STABILIZATION_CHECKLIST`)

| Stage | المعنى | الحالة |
|-------|--------|--------|
| 0 | baseline + freeze | ✅ `done` |
| 1 | Tauri skeleton + bridge | ✅ `done` |
| 2 | Rust-native backend port | ✅ `done` |
| 3 | renderer parity + UX | ✅ `done` |
| 4 | packaging + CI (+ Flatpak prep) | 🔄 `in_progress` |
| 5 | release gate (عند إعلان product-ready) | ⬜ `open` |

**ملاحظة تصنيف:** عناصر مثل **تنفيذ حقيقي لـ `runtime_install`** أو **سد stubs الـ runtimes** هي **قرب parity / جاهزية منتج** أكثر من تعريف «Stage 5» الضيق في الـ checklist؛ يمكن سردها تحت «قبل الوسم» دون خلطها مع «تعبئة فقط».

---

## ما خلص (PRs تقريبية #21 → #32)

### Stack (Rust / Tauri)

| PR | الموضوع |
|----|---------|
| #21 | Tauri scaffold + مسارات native أولية (Git / SSH / Monitor / Runtime …) |
| #24 / #25 | باقي القنوات native + إزالة Node bridge |
| #29 | A4 — timeouts وتضييق shell (`exec_*_limit`، إلخ) |
| #30 | Tauri-first dev + إغلاق A4 (compose بـ `current_dir`، prune، `ps`/`sshpass`، إلخ) |

### Renderer / UI

| PR | الموضوع |
|----|---------|
| #22 / #23 | bridge parity + أيقونة + CI |
| #26 | Docker screen audit (dead code، notices) |
| #27 | Docker UI / Rust (`Ok()` wrapper) |
| #28 | B5 checklist + B1–B3 docs |

### Docs

| PR | الموضوع |
|----|---------|
| #32 | دقة Stage 2 (محاكاة jobs، probes عبر bash، stubs) — مذكور أيضًا داخل `STABILIZATION_CHECKLIST` |

---

## ما تبقى

### Stage 4 (ناقص / مستمر)

- **Flatpak:** `flatpak/io.github.karimodora.LinuxDevHome.tauri.yml` — جاهز للتحضير المحلي؛ **لا** job Flatpak ثقيل في CI حتى الموافقة (ثقيل، يُفضَّل قبل Flathub فقط).
- **Electron:** حذف من الريبو (`electron-vite`، `main/`، `preload/`، سكربتات التعبئة المرتبطة) — **خطوة منفصلة** بعد **Tauri-only** (لا مسار إلزامي لـ Electron)؛ انظر قيود `AGENT_WORK_PLAN`.

### قبل الوسم / جاهزية منتج (ليست بالضرورة «Stage 5» وحدها)

- **`runtime_install` في `job:start`:** من محاكاة (sleep) إلى تنفيذ حقيقي عندما يُعرَف المنتج جاهزًا لذلك.
- **`dh:runtime:check-deps`** و **`uninstall:preview`:** من stubs إلى تنفيذ عند الحاجة.
- **`pnpm smoke` على `main`** قبل أي إصدار؛ **`git tag` / GitHub Release** فقط بعد **إعلان صريح** بأن المنتج مكتمل (سياسة المشروع).

### غير مطلوب الآن (حسب الخطة)

- توسيع **product phases** في `phasesPlan.md` قبل **product-complete**.
- **Flatpak CI** الكامل كأولوية زمنية.

---

## مراجع سريعة

| ملف | الغرض |
|-----|--------|
| [`STABILIZATION_CHECKLIST.md`](./STABILIZATION_CHECKLIST.md) | معايير المراحل والأدلة |
| [`AGENT_WORK_PLAN.md`](./AGENT_WORK_PLAN.md) | تسلسل Tauri-only → حذف Electron → مراحل المنتج على Tauri |
| [`phasesPlan.md`](../phasesPlan.md) | خريطة المنتج طويلة المدى |

آخر مراجعة لهذا المستند: 2026-04-30.
