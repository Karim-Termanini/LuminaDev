# خطة عمل — Agent B و Agent A (المنطق الخلفي)

مستند تنفيذي يفصل المهام بين **Agent B** (واجهة، توثيق، CI خفيف) و**Agent A** (Rust، `ipc_invoke`، عقود `@linux-dev-home/shared`).

## قيود المنتج (متفق عليها)

- **لا ضغط «إصدار»** قبل ما يُعتبر البرنامج مكتملًا من وجهة نظر المنتج؛ لا نبني خطط موازية حول semver أو نشر دوري إلا عند الطلب الصريح.
- **Flatpak في النهاية**: مسار التعبئة والـ GitHub Actions المرتبط به ثقيل؛ يُفعَّل بعد استقرار المنتج والـ CI الأساسي، وليس كأولوية زمنية.

---

## Agent B — واجهة، توثيق، CI (بدون Flatpak الطويل)

| ID | المهمة | المخرجات / المعيار |
|----|--------|---------------------|
| B1 | توثيق الحالة الحقيقية | تحديث `README.md` و`docs/STABILIZATION_CHECKLIST.md`: Tauri + Rust IPC، ما هو «جاهز / جزئي / مخطط»، Flatpak «لاحقًا» — بدون وعود إصدار. **`done` (2026-04-30)** — ربط بخطة الوكلاء، تخفيف صياغة «release gate». |
| B2 | واجهة الأخطاء الصريحة | تدفقات تعتمد على `dh:docker:install` و`dh:docker:remap-port`: عرض واضح عند `ok: false` (ومنها `*_NOT_SUPPORTED`) بدون سلوك يشبه النجاح. **`done` (2026-04-30)** — `DockerPage.tsx` + `dockerError.ts` + اختبارات. |
| B3 | مراجعة شاشات Docker | أزرار وتبويبات متوافقة مع السلوك الفعلي على Tauri؛ تقليل أزرار «مربكة» بدون backend يدعمها. |
| B4 | CI خفيف وموثوق | triggers، cache، deps مناسبة لـ Linux/Tauri؛ **بدون** إطالة المسار بـ Flatpak إلى أن يُقرّ تفعيله. |
| B5 | اختبار يدوي / سيناريوهات حرجة | قائمة تحقق قصيرة (يمكن إبقاؤها في نفس المستند أو في checklist الرئيسي)؛ Flatpak يُذكر كـ «لاحقًا» فقط. |

---

## Agent A — Rust، IPC، عقود، أمان

| ID | المهمة | المخرجات / المعيار |
|----|--------|---------------------|
| A1 | تدقيق القنوات | مطابقة `packages/shared/src/ipc.ts` مع `ipc_invoke` / مسار Tauri. **`done` (تدقيق أولي 2026-04-30)** — انظر قسم «لقطة A1» أدناه؛ إصلاح `dh:docker:create` لإرجاع `id`. |
| A2 | `dh:docker:install` | **`open`** — حاليًا خطأ صريح `[DOCKER_INSTALL_NOT_SUPPORTED]` في Rust؛ تنفيذ لاحقًا عند الطلب. |
| A3 | `dh:docker:remap-port` | **`open`** — حاليًا `[DOCKER_REMAP_NOT_SUPPORTED]`؛ تنفيذ أو إخفاء الزر في الواجهة لاحقًا. |
| A4 | حدود الصلاحيات | مراجعة سريعة لمسارات Docker socket وSSH وأوامر shell: timeouts، allowlists، رسائل خطأ حتمية. |
| A5 | Flatpak (لاحقًا) | عند التفعيل: manifest، صلاحيات، job في Actions — **بعد** B4/A1 مستقرين. |

---

## ترتيب تنفيذ مقترح

1. **B1** + **A1** — يقلل الالتباس بين الوثائق والكود.
2. **B2** مع قرار واضح على **A2** و**A3** (تنفيذ أو unsupported نهائي مع نص ثابت).
3. **B3** حسب الحاجة بعد ظهور فجوات من المستخدمين أو من المراجعة.
4. **B4** بشكل مستمر خفيف.
5. **A5** (وB المرتبط بـ Flatpak) **آخرًا** عند الجاهزية للـ Actions الطويلة.

---

## لقطة A1 — تدقيق القنوات (2026-04-30)

- **`dh:dialog:folder` / `dh:dialog:file:open` / `dh:dialog:file:save`:** في **Tauri** لا تمر عبر `ipc_invoke`؛ الـ renderer يستدعي `@tauri-apps/plugin-dialog` مباشرة في `desktopApiBridge.ts`. في **Electron** تبقى عبر `ipcMain` في `apps/desktop/src/main/index.ts`. هذا مقصود وليس ثغرة في `lib.rs`.
- **بقية مفاتيح `IPC` في `ipc.ts`:** لها تطابق في `ipc_invoke` أو في `ipc_send` (كتابة الطرفية فقط) أو أحداث (`terminal:data` / `terminal:exit` من الـ backend).
- **إصلاح اليوم:** `dh:docker:create` كان يرجع `{ ok: true }` بلا `id`؛ صار يعيد `id` من stdout لـ `docker create` مع `autoStart` افتراضي `true` لمطابقة سلوك Electron/dockerode.

---

## مراجع سريعة في المستودع

- عقود IPC وأسماء القنوات: `packages/shared/src/ipc.ts`
- تنفيذ Tauri: `apps/desktop/src-tauri/src/lib.rs`
- واجهة Docker: `apps/desktop/src/renderer/src/pages/DockerPage.tsx`
- سياسة الجودة العامة: `CLAUDE.md` و`phasesPlan.md`

آخر تحديث: 2026-04-30 — B1، B2، لقطة A1 + إصلاح `docker:create`.
