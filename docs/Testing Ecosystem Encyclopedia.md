# 🧠 الدليل الشامل لمنظومة الاختبار البرمجي (Testing Ecosystem Encyclopedia)
## للأنظمة المعقدة: Tauri، Rust، TypeScript، Docker، Bash، CI/CD

---

## 1. هرم الاختبار المتكامل (5 مستويات)

| المستوى | الاسم | الغرض | الأدوات اللازمة |
|---------|-------|-------|------------------|
| 0 | Static Analysis | منع الأخطاء قبل تشغيل أي كود | rustfmt, clippy, cargo-audit, cargo-deny, ESLint, Prettier, TypeScript compiler, Oxlint, Biome |
| 1 | Smoke Tests | التأكد من صحة البيئة (Docker يعمل، صلاحيات الكتابة موجودة) | cargo test (مدمج)، std::process::Command، أي مكتشف اختبارات بسيط |
| 2 | Unit Tests | اختبار دوال صغيرة معزولة بأقصى سرعة | Rust: `cargo test` <br> TypeScript: Vitest، Jest، Node:test <br> Mocking: mockall (Rust)، vi.mock (Vitest)، Sinon.js، testdouble.js |
| 3 | Integration Tests | اختبار تفاعل الكود مع الخارج (Bash، Docker، نظام الملفات، الشبكة) | Rust: `cargo test` مع تكامل حقيقي <br> عزل الشبكة: wiremock (Rust)، nock (JS)، MSW (Mock Service Worker) <br> أوامر حقيقية: std::process::Command |
| 4 | Contract / IPC Tests | التأكد من أن البيانات بين Rust و JS لم تتغير | **Rust side**: serde، serde_json، `cargo test` لمقارنة JSON المتوقع<br>**TypeScript side**: Zod، Valibot، TypeBox، io-ts، Ajv (للتأكد من صحة البيانات الواردة)<br>**اختبار التوافق المزدوج**: تشغيل نفس مجموعة الاختبارات على الجانبين |
| 5 | E2E Tests | محاكاة المستخدم الحقيقي من البداية للنهاية | **Tauri specifically**: `tauri-driver`، Playwright + `@tauri-apps/plugin-cli`، Spectron (قديم)<br>**General**: Playwright، Cypress، Selenium WebDriver، Puppeteer<br>**للمكونات المنعزلة**: Storybook + Chromatic (اختبارات بصرية) |

---

## 2. الأدوات حسب الطبقة (شاملة كاملة)

### 🦀 Rust Backend (كل ما تحتاجه)

| المهمة | الأداة الأساسية | بدائل ممكنة |
|--------|----------------|--------------|
| كتابة الاختبارات | `cargo test` (مدمج في اللغة) | - |
| اختبار التوافق (Contract) | serde + serde_json مع `assert_eq` على النص JSON | prost (للـ protobuf) |
| عزل الشبكة | wiremock، httpmock | mockito (Rust) |
| إنشاء وهميات (Mocks) | mockall | doubles، fake (لبيانات زائفة حقيقية) |
| تغطية الكود (Coverage) | cargo-tarpaulin، grcov | cargo-llvm-cov (أحدث وأسرع) |
| اختبار الأداء | criterion، benchmark‑lib | - |
| اختبار الإجهاد (Fuzzing) | cargo-fuzz (libFuzzer) | proptest (اختبار قائم على الخصائص) |
| اختبار الوقت (Time) | fake-time، freezer | - |
| التحليل الثابت | clippy (linting)، rustfmt (تنسيق) | - |
| أمان المكتبات | cargo-audit (ثغرات معروفة) | cargo-deny (تراخيص وثغرات) |
| اختبار عدم التوقف (Concurrency) | loom (للنماذج المتزامنة)، tokio::test (للـ async) | - |

### 🟨 TypeScript / Frontend (الشامل الكامل)

| المهمة | الأداة الأساسية | بدائل ممكنة |
|--------|----------------|--------------|
| كتابة الاختبارات (Unit / Integration) | Vitest (الأسرع مع Vite) | Jest، Node:test، Mocha + Chai |
| اختبار المكونات (Component Testing) | Testing Library (React/Vue/Svelte) | Enzyme (قديم)، Vue Test Utils |
| اختبار العقد (Contract Validation) | Zod | Valibot، TypeBox، io-ts، Yup، Ajv (للـ JSON Schema) |
| وهميات (Mocks) | vi.mock (Vitest)، jest.mock | Sinon.js، testdouble.js، Mock Service Worker (للشبكة) |
| اختبار واجهة المستخدم (E2E) | Playwright (الأفضل حالياً) | Cypress، Puppeteer، Selenium |
| تغطية الكود | Vitest --coverage (v8/istanbul) | Jest --coverage |
| اختبار البصري (Visual Regression) | Percy، Chromatic (مع Storybook) | Loki، Happo.io، BackstopJS |
| التحليل الثابت | ESLint + Prettier + tsc --noEmit | Biome (أداة موحدة جديدة)، Oxlint (سريع جداً) |
| اختبار الأداء في المتصفح | Lighthouse CI (داخل CI) | WebPageTest API، Sitespeed.io |
| اختبار إمكانية الوصول (a11y) | jest-axe، @axe-core/playwright | pa11y، cypress-axe |

### 🐳 البيئة والنظام (Docker، Bash، نظام الملفات)

| المهمة | الأداة الأساسية | بدائل ممكنة |
|--------|----------------|--------------|
| اختبار أوامر Bash/shell | تشغيل حقيقي داخل `cargo test` | Bats (Bash Automated Testing System) |
| اختبار Dockerfile | dockle (فحص الأمان)، hadolint (linting) | container-structure-test (من Google) |
| اختبار تنسيق Docker Compose | docker compose config --quiet | - |
| إدارة بيئات الاختبار المؤقتة | testcontainers (Rust، Node، Generic) | docker-compose up --abort-on-container-exit |
| اختبار وجود الأدوات في PATH | تشغيل `which tool` داخل اختبار التكامل | - |
| اختبار صلاحيات الملفات | std::fs::metadata داخل test | - |
| محاكاة نظام الملفات للاختبارات السريعة | tempfile crate (Rust)، tmp-promise (Node) | memfs (نظام ملفات في الذاكرة للـ JS) |

---

## 3. اختبار البيئات الخاصة بـ Tauri

Tauri أربع طبقات اتصال تحتاج كل أدواتها الخاصة:

| الطبقة | ما تختبره | الأدوات اللازمة |
|--------|-----------|------------------|
| **IPC (المراسلة)** | هل الـ Frontend يفهم ردود الـ Backend؟ | Zod على الـ JS، serde_json على الـ Rust + اختبار Contract بالمقارنة |
| **Window Management** | هل تنفتح النوافذ؟ هل ترسل الإشارات؟ | Playwright يستطيع الانتظار على وجود نافذة جديدة، `tauri-driver` |
| **System Tray** | هل أيقونة الشريط تستجيب للنقر؟ | اختبار يدوي (صعب أتمتته) أو Playwright مع سياقات خاصة |
| **Auto Updater** | هل يتم التحديث دون كسر البيانات؟ | CI منفصل مع خادم تحديث وهمي، واختبارات التكامل مع إصدار قديم حقيقي |

**أدوات إضافية خاصة بـ Tauri فقط:**
- `tauri-driver`: سائق مخصص لتشغيل الاختبارات الآلية في نوافذ Tauri.
- `@tauri-apps/api/mocks`: لمحاكاة الأوامر في Frontend خلال الاختبارات.
- `tauri-build` مع features تجريبية لاختبار المكونات في وضع headless.

---

## 4. CI/CD (أتمتة كل شيء)

| المنصة | الأدوات المطلوبة | ملاحظات خاصة بـ Tauri |
|--------|-----------------|------------------------|
| **GitHub Actions** | `actions/checkout@v4`<br>`actions-rs/toolchain`<br>`tauri-apps/tauri-action` (للـ builds)<br>`Swatinem/rust-cache` (لتسريع التخزين المؤقت)<br>`msarch/setup-playwright` | **الأكثر استخداماً مع Tauri**، `tauri-action` يبني وينشر ويعمل الاختبارات في خطوة واحدة |
| **GitLab CI** | قوالب Rust الرسمية، صورة Docker تحتوي على Tauri dependencies | تحتاج إلى إعداد Xvfb (للواجهات الرسومية) يدوياً |
| **CircleCI** | orb لـ Rust و orb لـ Playwright | أقل شيوعاً مع Tauri لكن يعمل |
| **Drone CI** | تنفيذ أوامر Docker مباشرة | مناسب للشركات التي تملك Drone بالفعل |
| **محلي باستخدام pre-commit** | `pre-commit` hooks لكل ما يلي:<br> - `cargo fmt`<br> - `cargo clippy`<br> - `npm run lint`<br> - `cargo test -- --ignored` (الاختبارات السريعة فقط) | يمنع دفع أي كود يخفق في أبسط الاختبارات |

**ما يجب أن تفعله CI في كل commit:**
1. تشغيل التحليل الثابت (rustfmt, clippy, tsc, eslint)
2. تشغيل Smoke Tests (هل Docker موجود؟)
3. تشغيل Unit Tests (كلها، لأنها سريعة)
4. تشغيل Contract Tests (للتأكد من JSON لم يتغير)
5. تشغيل Integration Tests (التي لا تحتاج Docker إن أمكن)
6. (اختياري) تشغيل أسرع E2E واحد فقط للتأكد من أن التطبيق يفتح ويقفل)

**ما يجب أن تفعله CI في الـ Pull Request (قبل الدمج):**
- كل ما سبق + اختبارات التكامل الكاملة (بما فيها Docker)
- بناء التطبيق لـ 3 أنظمة تشغيل (إن أمكن)
- تشغيل E2E كاملة في بيئة headless

---

## 5. التنظيف وإدارة الموارد (ما يُنسى دائماً)

| نوع المورد | أداة التنظيف التلقائي | متى يتم التنظيف؟ |
|-------------|----------------------|------------------|
| حاويات Docker | `docker rm -f` في `finally` أو `Drop` trait | بعد كل اختبار يستخدم Docker |
| صور Docker | `docker rmi` (فقط إذا أنشأها الاختبار) | بعد كل مجموعة اختبارات (أو نادراً) |
| شبكات Docker مؤقتة | `docker network prune --force` | في نهاية CI |
| ملفات مؤقتة | `tempfile::TempDir` (ينظف تلقائياً عند الخروج من النطاق) | تلقائياً |
| مجلدات مشتركة بين الاختبارات | استخدم مجلداً فريداً لكل اختبار `test_${pid}_${random}` | يمسح نفسه بنفسه |
| عمليات خلفية (Background processes) | `std::process::Child::kill()` | في `Drop` أو `afterEach` |
| بيئات اختبار Kubernetes (إن وجدت) | `kubectl delete namespace test-xyz` | في نهاية الاختبار |

**الجمعة الذهبية:** *لا تستخدم `String::from("/tmp/my_test_folder")` أبداً، استخدم `tempfile::TempDir` أو `mkdtemp`.*

---

## 6. أدوات قياس الجودة والتغطية

| المقياس | الأداة | الهدف الأدنى |
|---------|--------|--------------|
| تغطية الكود (Line Coverage) | tarpaulin (Rust)، vitest --coverage (JS) | 80% للكود الحرج، لا قيود على الكود البسيط |
| تغطية العقد (Contract Coverage) | يدوي عن طريق عدد أوامر IPC المختبرة | 100% (كل أمر IPC يجب أن يكون له اختبار Contract) |
| تغطية المسارات الحرجة (Critical Path) | يدوي + Playwright | 100% (تثبيت runtime، تشغيل container، إلغاء task) |
| زمن الاختبارات (Test Speed) | cargo test --timings، vitest --silent --reporter=json | كل الاختبارات < 3 دقائق محلياً، < 10 دقائق في CI |
| الهشاشة (Flakiness) | تسجيل الاختبارات التي تفشل عشوائياً يدوياً أو باستخدام `flaky` crate | يجب أن تكون 0% (إذا فشل مرة عشوائياً، أُعزله حتى يصلح) |
| اكتشاف الأخطاء قبل الإنتاج | خط الـ CI نفسه | عدد الأخطاء التي تكتشفها CI قبل وصولها إلى `main` (يجب أن يكون 100%) |

---

## 7. قائمة الفحص النهائية للمشروع (لا تنسَ شيئاً)

### عند بدء مشروع جديد:
- [ ] **إعداد أدوات التحليل الثابت** (rustfmt, clippy, ESLint, Prettier, tsc)
- [ ] **إعداد cargo-audit و cargo-deny في CI**
- [ ] **إعداد Vitest للـ Frontend** (أو Jest)
- [ ] **إعداد Playwright للتشغيل المحلي**
- **إضافة tempfile إلى Rust dependencies**

### عند كتابة أول أمر Tauri IPC:
- [ ] **إضافة Zod schema على الجانب JS**
- [ ] **كتابة اختبار Contract في Rust (`cargo test`) يقارن JSON**
- [ ] **استخدام safeParse في JS لبيئة التطوير فقط**

### عند كتابة أي دالة تتعامل مع Docker أو Bash:
- [ ] **اختبار Integration حقيقي يعمل Docker**
- [ ] **تنظيف الحاويات/الملفات بعد الاختبار**
- [ ] **اختبار حالة الفشل (مثلاً: Docker ليس موجوداً في PATH)**

### قبل فتح Pull Request:
- [ ] `cargo clippy` و `cargo fmt` و `cargo test` كلها تمر
- [ ] `npm run lint` و `npm run type-check` و `vitest run` تمر
- [ ] **الاختبارات تعمل محلياً دون إنترنت** (ما عدا التي تحتاج Docker)
- [ ] **لم يتبق أي `console.log` أو `dbg!` في الكود**

### في CI (قبل الدمج مع main):
- [ ] **كل الاختبارات تعمل على Ubuntu (أقل البيئات غنى)**
- [ ] **بناء التطبيق لـ Windows و macOS و Linux ينجح**
- [ ] **Playwright E2E يجتاز اختبارين حرجين على الأقل**

---

## 8. الأدوات حسب المشكلة (إذا واجهت خطأً، ماذا تستخدم؟)

| نوع الخطأ | الأداة المناسبة |
|-----------|------------------|
| "كان يعمل الأسبوع الماضي، اليوم لا يعمل" | cargo test -- --ignored + git bisect للعثور على الـ commit الذي كسره |
| "البيانات تأتي فارغة من Rust" | Zod validation في JS + طباعة الأخطاء + اختبار Contract |
| "يعمل على جهازي لكن لا يعمل في CI" | تشغيل Docker محلياً بنفس صورة CI + استخدام `docker run --rm` لمحاكاة البيئة |
| "Docker container يعلق في الاختبارات" | إضافة timeout باستخدام `std::time::Duration` واستخدام `docker kill` في cleanup |
| "الاختبار ينجح مرة ويفشل مرة" | **علامة أكيدة على عدم التنظيف الجيد** → أضف unique ID لكل اختبار وتحقق من `tempfile` |
| "التطبيق يعلق عند بدء التشغيل في CI" | تشغيل CI مع `xvfb-run` لمحاكاة شاشة رسومية (خاص بـ Tauri) |
| "الـ JSON تغير شكله بدون سبب" | أضف اختبار Contract باستخدام `serde_json::to_string_pretty` وقارنه بنسخة سابقة |

---

## 9. الموارد البشرية والمهارات (لتوزيع الأدوار في الفريق)

| الدور | الأدوات التي يجب أن يتقنها |
|-------|--------------------------|
| **مطور Backend (Rust)** | `cargo test`، mockall، wiremock، cargo-tarpaulin، cargo-fuzz |
| **مطور Frontend (TS)** | Vitest، Zod، Testing Library، Playwright |
| **مهندس DevOps** | GitHub Actions (أو GitLab CI)، testcontainers، docker compose، xvfb |
| **مهندس ضمان جودة (QA) مخصص** | Playwright Test Runner، Percy (اختبار بصري)، axe (a11y)، إدارة البيئات اليدوية |
| **أي مطور في الفريق (الحد الأدنى)** | pre-commit hooks، تشغيل الاختبارات محلياً قبل push، قراءة تقارير cargo-audit |

---

## 10. التوسعات المستقبلية (إذا كبر المشروع)

عندما يصبح المشروع أكبر وأكثر أهمية:

| المهمة | الأداة الجديدة |
|--------|----------------|
| اختبار وقت التشغيل (Runtime Performance) | criterion مع تسجيل التدهور في الأداء تلقائياً |
| اختبار الاختراق (Fuzzing) للـ IPC | cargo-fuzz مع مدخلات عشوائية لأوامر Tauri |
| محاكاة ظروف الشبكة الضعيفة | playwright --throttling، Toxiproxy (لمحاكاة بطء الشبكة أو انقطاعها) |
| تسجيل وتتبع جميع الاختبارات تاريخياً | datadog أو sentry لجمع تقارير الفشل |
| اختبار التوافق عبر إصدارات Tauri المختلفة | تفعيل matrix في CI (Tauri 1.x, 2.x) |
| أتمتة اختبار التحديث التلقائي | خادم تحديث محلي (`miniserve`) مع إصدارين مختلفين |
