CodeRabbit Review

Diff      : all local changes (committed + uncommitted)
Compare   : docs/architectural-clarification → main
Directory : LuminaDev
────────────────────────────────────────

(\(\
(• .•)  Prototype to learn. Prototyping is a learning experience. Its value lies not in the code you produce, but in the lessons you learn.

✔ Preparing review
✔ Summarizing changes

────────────────────────────────────────────────────────────────────────
  minor [potential_issue]
  → apps/desktop/src-tauri/src/executor.rs:11-18

  User-configurable resource limits removed.

  The function now ignores the app parameter and uses hardcoded constants
  (CPU 80%, RAM 4096 MB). This removes the ability for users to configure
  resource limits via store.json. If this is intentional:

  1. Consider removing the unused _app parameter from the signature to
  avoid confusion.
  2. Document why fixed limits are preferred over user configuration.

  If user configurability should be preserved, the previous store.json
  lookup logic needs to be restored.

────────────────────────────────────────────────────────────────────────
  minor [potential_issue]
  → apps/desktop/src-tauri/src/git_doctor.rs:235

  Trim the signing config value before comparison.

  exec_output may return a string with trailing whitespace. The comparison
  v != "true" should be v.trim() != "true" to avoid false negatives.

  Proposed fix

-            if signing.map_or(true, |v| v != "true") {

-            if signing.map_or(true, |v| v.trim() != "true") {

────────────────────────────────────────────────────────────────────────
  minor [potential_issue]
  → apps/desktop/src-tauri/src/runtime_logs.rs:78

  Off-by-one: Stream cap allows 21 instead of 20.

  The condition if streams.len() > 20 allows 21 concurrent streams before
  eviction starts. If the intent is to enforce a strict cap of 20, change to
  >= 20.

  🔧 Proposed fix

-        if streams.len() > 20 {

-        if streams.len() >= 20 {

────────────────────────────────────────────────────────────────────────
  minor [potential_issue]
  → apps/desktop/src-tauri/src/runtime_jobs.rs:921-961

  Potential shell injection if paths contain special characters.

  The project_dir and to_dir.display() values are interpolated directly
  into shell commands without escaping single quotes. If these paths contain
  ' characters, the command will break or behave unexpectedly.

  Proposed fix

-                let cmd = format!("export PROJECT_DIR='{}' && cd '{}' && docker compose --progress plain {} pull && docker compose {} up -d", project_dir, to_dir.display(), overlay, overlay);

-                let safe_project_dir = project_dir.replace('\'', "'\\''");
-                let safe_to_dir = to_dir.display().to_string().replace('\'', "'\\''");
-                let cmd = format!("export PROJECT_DIR='{}' && cd '{}' && docker compose --progress plain {} pull && docker compose {} up -d", safe_project_dir, safe_to_dir, overlay, overlay);

────────────────────────────────────────────────────────────────────────
  minor [potential_issue]
  → docs/FORWARD_PLAN_2026-05-28.md:296-301

  Inconsistency between release gate checklist and execution order.

  Lines 296-301 show unchecked boxes for P1 and P2.1 completion, but the
  execution order at lines 326-332 marks P1.1-P1.6 as "✅ DONE". Either:

- Update the checkboxes to [x] if those items are complete, or
- Update the execution order to show them as pending

  Proposed fix

  If P1 items are complete (as execution order suggests), update the
  checkboxes:

   `v0.3.0-beta` after:
  -- [ ] P1 complete (profile binding, stream cleanup, cache pre-warm, sidebar refactor)
  -- [ ] P2.1 complete (per-container stats)
  +- [x] P1 complete (profile binding, stream cleanup, cache pre-warm, sidebar refactor)
  +- [ ] P2.1 complete (per-container stats)

- [ ] AppImage verified on clean Ubuntu + Fedora
- [ ] `pnpm smoke` green on all three test configs

────────────────────────────────────────────────────────────────────────
  major [potential_issue]
  → apps/desktop/src/renderer/src/pages/GitConfigPage.tsx:715-723

  gitDoctorScan result is not validated before using findings/score.

  Both scan paths mark phase as done without checking failure response
  shape. If backend returns { ok: false, error }, UI can show misleading
  “done” state.

  💡 Proposed fix

     async function runScan(): Promise<void> {
       setPhase('scanning')
       try {
         const res = await window.dh.gitDoctorScan()

-      if (!res.ok) {
-        throw new Error(res.error ?? 'Git doctor scan failed.')
-      }
         setFindings(res.findings ?? [])
         setScore(res.healthScore ?? 0)
         setGitVer(res.gitVersion ?? null)
         setPhase('done')
       } catch {
         setPhase('error')
       }
     }

  Based on learnings: All IPC responses must use `{ ok: boolean; error?:
  string } shape with error strings prefixed with [ERROR_CODE]`.

  Also applies to: 2147-2156

────────────────────────────────────────────────────────────────────────
  major [potential_issue]
  → apps/desktop/src/renderer/src/pages/FirstRunWizardPage.tsx:118-120

  Completion and wizard copy is hardcoded and can be incorrect for actual
  user choices.

  The UI text is not fully localized and the completion message always
  claims dark theme + git identity configured, even when users choose light
  theme or skip identity.

  Also applies to: 168-169, 194-197, 208-213

────────────────────────────────────────────────────────────────────────
  major [potential_issue]
  → apps/desktop/src/renderer/src/pages/FirstRunWizardPage.tsx:6-227

  New route is missing the required colocated contract/error helper and test
  coverage.

  Please add colocated contract/error helper(s) and route tests for this
  page to align with repository route standards.

  As per coding guidelines: apps/desktop/src/renderer/src/pages/*.tsx:
  Create one file per route in pages/ directory with colocated
  contract/error helpers and tests.

────────────────────────────────────────────────────────────────────────
  major [potential_issue]
  → apps/desktop/src/renderer/src/pages/GitConfigPage.tsx:2569-2574

  Validate imported backup row shape before applying keys.

  handleImport trusts parsed objects and writes keys[r.key] = r.value
  without checking types. Malformed JSON can produce invalid writes.

  💡 Proposed fix

-      const parsed = JSON.parse(importText) as ConfigRow[]

-      const parsed = JSON.parse(importText) as unknown
         if (!Array.isArray(parsed)) throw new Error(t('config.backups.invalidFormat'))
         const keys: Record<string, string> = {}

-      parsed.forEach((r) => {
-        keys[r.key] = r.value

-      parsed.forEach((r) => {
-        if (
-          !r ||
-          typeof r !== 'object' ||
-          typeof (r as { key?: unknown }).key !== 'string' ||
-          typeof (r as { value?: unknown }).value !== 'string'
-        ) {
-          throw new Error(t('config.backups.invalidFormat'))
-        }
-        keys[(r as { key: string }).key] = (r as { value: string }).value
         })

────────────────────────────────────────────────────────────────────────
  major [potential_issue]
  → apps/desktop/src/renderer/src/pages/ProfilesPage.tsx:2240-2248

  Credential save is optimistic and ignores persistence failure.

  profileCredentialsStore is called without awaiting/validating result, so
  the profile can link credentials that were never actually saved.

  Suggested fix

- onClick={() => {

- onClick={async () => {
      if (!credInputValue.trim()) return

- const credIds = [...(wizardData.credentialIds || []), credInputId]
- setWizardData({ ...wizardData, credentialIds: credIds })
- void window.dh.profileCredentialsStore({

- const saveRes = await window.dh.profileCredentialsStore({
        id: credInputId,
        value: credInputValue.trim(),
      })
- if (!saveRes.ok) {
-     setStatus({ message: saveRes.error || t('msg.saveFailed'), type: 'warning' })
-     return
- }
- const credIds = Array.from(new Set([...(wizardData.credentialIds || []), credInputId]))
- setWizardData({ ...wizardData, credentialIds: credIds })
      setCredInputId('')
      setCredInputValue('')
    }}

  Also applies to: 2452-2459

────────────────────────────────────────────────────────────────────────
  major [potential_issue]
  → apps/desktop/src/renderer/src/pages/ProfilesPage.tsx:2295-2301

  Unlink action is deleting shared credentials globally.

  Removing a credential from one profile should not immediately delete the
  secret from the global store; this can break other profiles reusing the
  same credentialId.

  Suggested fix

- const cId = oldIds[i]
- if (cId) void window.dh.profileCredentialsDelete({ id: cId })
    const credIds = oldIds.filter((_, idx) => idx !== i)
    setWizardData({ ...wizardData, credentialIds: credIds })

- const cId = oldIds[ci]
- if (cId) void window.dh.profileCredentialsDelete({ id: cId })
    const credIds = oldIds.filter((_, i) => i !== ci)
    setWizardData({ ...wizardData, credentialIds: credIds })

  Also applies to: 2411-2415

────────────────────────────────────────────────────────────────────────
  major [potential_issue]
  → apps/desktop/src/renderer/src/pages/RuntimesPage.tsx:152-165

  Installed versions cache can become stale after mutate actions.

  loadInstalledVersions exits early when cache exists, but
  setRuntimeActive/removeVersion never invalidate or refresh that cache.
  The detected list can stay outdated after version removal/switch.

  Suggested fix

- const loadInstalledVersions = useCallback(async (runtimeId: string) => {
- if (installedVersionsCache[runtimeId]) return

- const loadInstalledVersions = useCallback(async (runtimeId: string, force = false) => {
- if (!force && installedVersionsCache[runtimeId]) return
      setLoadingInstalledVersions(true)
      try {
        const res = await window.dh.runtimeInstalledVersions(runtimeId)
        if (res.ok) {
          setInstalledVersionsCache((prev) => ({ ...prev, [runtimeId]: res.versions }))
        }
      } catch {
        // user can still install with 'latest'
      } finally {
        setLoadingInstalledVersions(false)
      }
    }, [installedVersionsCache])

        try {
          const res = await window.dh.runtimeSetActive({ runtimeId: selectedId, path })
          assertRuntimeOk(res, t('page.errorActive'))
          await refreshStatus()
-       await loadInstalledVersions(selectedId, true)
        } catch (e) {

        try {
          const res = await window.dh.runtimeRemoveVersion({ runtimeId: selectedId, version, path })
          assertRuntimeOk(res, t('page.errorRemove'))
          await refreshStatus()
-       await loadInstalledVersions(selectedId, true)
        } catch (e) {

  Also applies to: 189-222, 601-668

────────────────────────────────────────────────────────────────────────
  critical [potential_issue]
  → apps/desktop/src/renderer/src/pages/SshPage.tsx:370-375

  Shell command injection risk in transfer execution.

  Transfer commands are built by string interpolation and executed via `bash
  -c. User-controlled values (host, user`, paths) can inject arbitrary
  shell syntax.

  Suggested fix direction

- function shQuote(v: string): string {
- return `'${v.replace(/'/g,`'\\''`)}'`
- }
  ...

- const files = ftLocalPaths.map((p) => `"${p}"`).join(' ')

- const files = ftLocalPaths.map((p) => shQuote(p)).join(' ')
  ...

- ? `scp -P ${ftSession.port} -r ${files} ${remote}:${ftRemotePath}`

- ? `scp -P ${ftSession.port} -r ${files} ${shQuote(`${remote}:${ftRemotePath}`)}`
  ...

- : `rsync -avz -e 'ssh -p ${ftSession.port}' ${files} ${remote}:${ftRemotePath}`

- : `rsync -avz -e ${shQuote(`ssh -p ${ftSession.port}`)} ${files} ${shQuote(`${remote}:${ftRemotePath}`)}`

  Preferably, avoid bash -c entirely and send executable + args separately
  for transfer mode.

  Also applies to: 517-543

────────────────────────────────────────────────────────────────────────
  minor [potential_issue]
  → docs/superpowers/plans/2026-05-28-global-nav-command-palette.md:187

  Clear blur timer on unmount to prevent memory leak.

  blurTimerRef is set at line 321 but never cleared when the component
  unmounts. If the user navigates away while the timer is active, it will
  leak.

  🧹 Recommended cleanup

  Add a cleanup effect:

  useEffect(() => {
    return () => {
      if (blurTimerRef.current) {
        clearTimeout(blurTimerRef.current)
      }
    }
  }, [])

  Or, if the blur timeout is short (150ms), document that the leak is
  bounded and acceptable for this use case.

  Also applies to: 321-321

────────────────────────────────────────────────────────────────────────
  major [potential_issue]
  → docs/superpowers/specs/2026-05-28-dashboard-logs-streaming-design.md:66

  Resolve inconsistency: AbortHandle vs JoinHandle for stream tracking.

  Line 66 specifies storing tokio::task::AbortHandle in
  AppState.streams, but line 101 says Mutex>>. These are different
  types:

- JoinHandle is returned by tokio::spawn and can be .awaited or
  .abort()ed.
- AbortHandle is obtained via .abort_handle() on a JoinHandle and
  can only .abort().

  For stream management, AbortHandle is preferred (lighter weight, only
  stores abort capability). The spec should be consistent.

  Recommended fix: Update line 101:

  -| `apps/desktop/src-tauri/src/state.rs` | Add `streams: Mutex<HashMap<String, JoinHandle<()>>>` to AppState |
  +| `apps/desktop/src-tauri/src/state.rs` | Add `streams: Mutex<HashMap<String, tokio::task::AbortHandle>>` to AppState |

  This matches the implementation plan in the first file and is the correct
  approach for cancellation-only tracking.

  Also applies to: 101-101

────────────────────────────────────────────────────────────────────────
  major [refactor_suggestion]
  → docs/superpowers/specs/2026-05-28-dashboard-kernels-design.md:44

  Specify return format for systemctl_is_active_fallback.

  Line 44 introduces systemctl_is_active_fallback but doesn't define the
  response shape. The spec says it "returns the first active one's status +
  actual unit name found," but this should be formalized.

  Add to the spec:

  **Response format:**

  json
  {
  "ok": true,
  "status": "active" | "inactive" | "failed",
  "unit": "sshd" // the discovered unit name from altUnits
  }

  Or if no unit is found:

  json
  {
  "ok": false,
  "error": "[SYSTEMCTL_UNIT_NOT_FOUND] None of the specified units exist."
  }

  This ensures frontend and backend developers have a clear contract. Based
  on learnings, "All IPC responses must use `{ ok: boolean; error?: string
  } shape with error strings prefixed with [ERROR_CODE]`."

────────────────────────────────────────────────────────────────────────
  major [potential_issue]
  → docs/superpowers/plans/2026-05-28-dashboard-widgets-page.md:338

  Hardcoded profile 'web-dev' will cause issues in multi-profile setups.

  Lines 338 and 345 hardcode profile: 'web-dev' for all layout operations.
  The note at line 520 acknowledges this as a placeholder, but it's a
  critical issue: if the user switches to a different profile in the
  dashboard, their widget changes will be saved to/loaded from the wrong
  profile's layout.

  Recommended approach: Thread the active profile from DashboardMainPage
  context or a global store. Example:

  // Use a context or prop
  const { activeProfile } = useDashboardContext()
  
  // Then:
  await window.dh.layoutSet({ profile: activeProfile, layout: next })

  Without this, users will experience unexpected behavior when managing
  widgets for non-web-dev profiles.

  Also applies to: 345-345

────────────────────────────────────────────────────────────────────────
  minor [potential_issue]
  → docs/superpowers/plans/2026-05-28-dashboard-logs-streaming.md:329-344

  Race condition: event listener may fire after component unmount.

  The listen callback on lines 329-344 accesses terminalRef.current and
  streamIdRef.current. If the component unmounts while events are still
  queued, these refs will be stale. The cleanup (lines 378-386) calls
  unlisten(), but there's a potential race window.

  Recommended mitigation: Add a mounted ref:

  const mountedRef = useRef(true)
  
  // In cleanup:
  useEffect(() => {
    void startStream()
    return () => {
      mountedRef.current = false
      // ... existing cleanup
    }
  }, [startStream])
  
  // In listener:
  listen('dh:log:line', (event) => {
    if (!mountedRef.current || event.payload.streamId !== streamIdRef.current) return
    // ... rest of handler
  })

────────────────────────────────────────────────────────────────────────
  minor [potential_issue]
  → docs/superpowers/plans/2026-05-28-dashboard-main-widgets.md:141-162

  Remove duplicate layout prop.

  The DashboardWidgetDeck component receives the layout prop twice
  (lines 141 and 161). This is redundant and will cause a React warning.

  🔧 Fix: remove line 161

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

- layout={profileLayout}
     />

────────────────────────────────────────────────────────────────────────
  minor [potential_issue]
  → docs/superpowers/plans/2026-05-28-dashboard-main-widgets.md:120-127

  Add setProfileLayout to effect dependencies.

  The effect at lines 120-127 uses setProfileLayout in the callback but
  doesn't list it in the dependency array. React's exhaustive-deps rule will
  flag this.

  🔧 Recommended fix

   useEffect(() => {
     if (!activeProfile) return
     window.dh.layoutGet({ profile: activeProfile }).then((res) => {
       if (res && (res as any).ok !== false) {
         setProfileLayout(res as DashboardLayoutFile)
       }
     }).catch(() => {/*non-fatal*/})
  -}, [activeProfile])
  +}, [activeProfile, setProfileLayout])

  Alternatively, if setProfileLayout is from useState, it's stable and
  can be omitted. But for clarity and linter satisfaction, include it.

────────────────────────────────────────────────────────────────────────
  major [refactor_suggestion]
  → docs/superpowers/specs/2026-05-28-dashboard-kernels-design.md:59-60

  Clarify IPC payload structure for systemctl commands.

  Line 59 shows dh:host:exec { command: 'systemctl_start', unit: '...' },
  but based on learnings, dh:host:exec payloads are validated by
  HostExecRequestSchema. The spec should reference this schema or provide
  a complete example payload.

  Update the spec to match the established IPC pattern:

  -**Start button**: calls `dh:host:exec { command: 'systemctl_start', unit: '...' }` → re-poll status.
  +**Start button**: calls `window.dh.hostExec({ command: 'systemctl_start', args: { unit: '...' } })` → re-poll status.

  And ensure HostExecRequestSchema in packages/shared/src/schemas.ts is
  updated to include systemctl_start in its allowed commands. Based on
  learnings, "Request payloads must be validated at the IPC boundary using
  Zod schemas."

────────────────────────────────────────
Review complete
21 findings ✔

Critical 1
Major    11
Minor    9
────────────────────────────────────────

Print all AI prompts: coderabbit review --show-prompts
