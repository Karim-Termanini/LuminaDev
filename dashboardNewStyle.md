Perfect. You want the complete picture. Here's **everything** organized as a comprehensive reference.

---

# COMPLETE DEVELOPER DASHBOARD REFERENCE

## The Unified Mental Model

A developer working on a Docker-isolated project needs to know **15 categories of information** at any moment. Here they are, ranked by frequency of need:

---

## TIER 1: CHECK EVERY 30 SECONDS (Critical Path)

### 1. Git Status

**What developers need to know:**

- Current branch name
- Uncommitted changes (modified, added, deleted files)
- Staged vs unstaged changes
- Ahead/behind remote counts
- Merge/rebase/cherry-pick in progress
- Stash count
- Last commit hash + message + time

**What to show:**

```
main · 3 files changed (+42/-12) · ↑2 ahead ↓0 behind
[Commit] [Push] [Pull] [Stash (2)] [View Diff]
```

**LuminaDev status:** ✅ Phase 4 has this. Surface on Dashboard.

---

### 2. Running Services Status

**What developers need to know:**

- Which services are up/down
- Port mappings (host:container)
- Health status (healthy/unhealthy/starting)
- Uptime per service
- Log output tail (last line)
- Restart count (if crashing loop)

**What to show:**

```
✓ api:3000 → http://localhost:3000 | uptime 2h
✓ db:5432 → postgres://localhost:5432 | healthy
✗ redis:6379 → OOM killed 3m ago | [Restart] [Logs]
⚠ worker:3001 → unhealthy (exit 1) | [Inspect]
```

**LuminaDev status:** 🔄 Need to implement. Phase 2 has Docker commands, just need to filter by project.

---

### 3. Active Terminal Sessions

**What developers need to know:**

- Which terminals are open
- Current working directory of each
- What command is running (if any)
- Last output line (preview)
- Age (how long since last activity)
- Which project each belongs to

**What to show:**

```
Terminals (3 active)
├─ npm run dev    | 3000 | 22m ago | "ready in 2.3s"
├─ docker logs -f | redis | 12m ago | "OOM killer"
└─ tail -f app.log | logs | 2m ago | "ERROR: connection refused"
[Focus] [Kill] [New Terminal]
```

**LuminaDev status:** ❌ Not implemented. Phase 3 has SSH terminal, but no session management.

---

### 4. Active Background Jobs

**What developers need to know:**

- What's running (docker pull, npm install, build, etc.)
- Progress percentage
- Estimated time remaining
- Cancellable or not
- Log output stream

**What to show:**

```
Running Jobs (2)
████████░░ docker pull postgres:15    78% (12s)
██░░░░░░░░ npm audit fix              15% (2m)
Completed Jobs (1)
✅ pnpm install (3.2s) · 2m ago · 42 packages
```

**LuminaDev status:** ✅ Phase 0 Job Runner exists. Just need UI surface on Dashboard.

---

## TIER 2: CHECK EVERY 5 MINUTES (Environment Health)

### 5. Environment Variables

**What developers need to know:**

- Missing required vars (compare .env.example)
- Overridden vs default values
- Secret detection (API keys in committed .env)
- Per-service injection status
- Deprecated/renamed vars

**What to show:**

```
⚠ .env issues (3)
├─ MISSING: DATABASE_URL (required by db service)
├─ MISSING: REDIS_URL (required by cache service)
└─ WARNING: API_KEY found in .env (uncommitted)
[Create .env from example] [Validate]
```

**LuminaDev status:** ❌ Not implemented. Phase 8 Settings will have storage.

---

### 6. Dependency Health

**What developers need to know:**

- Lockfile sync (package.json vs lockfile mismatch)
- Installation status (node_modules up to date?)
- Outdated packages
- Security vulnerabilities (CVEs)
- Deprecated packages
- Peer dependency conflicts

**What to show:**

```
Dependencies: 🟡 2 issues
├─ axios@1.5.0 → CVE-2024-1234 (critical) [Update]
├─ lodash@4.17.20 → outdated (current 4.17.21) [Update]
└─ lockfile: ✅ synced with package.json
[npm audit fix] [Update All]
```

**LuminaDev status:** ❌ Not implemented. Needs integration with package managers.

---

### 7. Build Pipeline Status

**What developers need to know:**

- Last build result (pass/fail/time)
- Build error (file + line number)
- Test failures (which tests, why)
- Lint/type-check errors (count + worst offenders)
- Build duration trend (getting slower?)

**What to show:**

```
Build: 🔴 FAILED (2m ago)
Error: src/api/auth.ts:23 - Type 'Request' is missing property 'user'
Test failures: 3/42 failed
├─ auth.test.ts: should reject invalid token
├─ user.test.ts: should update profile
└─ rate-limit.test.ts: should throttle requests
[View Build Logs] [Run Tests] [Fix Lint Errors]
```

**LuminaDev status:** ❌ Not implemented. Could integrate with Phase 0 Job Runner.

---

### 8. Container Resource Usage (Project-Specific)

**What developers need to know:**

- CPU per service (vs limit)
- RAM per service (vs limit)
- Disk I/O per service
- Network I/O per service
- Which container is the bottleneck

**What to show:**

```
Resource Usage (project)
api:     CPU 45%/2 cores | RAM 312MB/512MB | Net 1.2MB/s
db:      CPU 12%/1 core  | RAM 256MB/1GB   | Disk 50MB/s
redis:   CPU 2%/0.5 core | RAM 89MB/256MB  | ✗ DOWN
[View Details] [Adjust Limits]
```

**LuminaDev status:** 🔄 Phase 5 Monitor has system metrics. Need to filter by project labels.

---

### 9. Docker Storage Health

**What developers need to know:**

- Total disk usage (containers + images + volumes + cache)
- Growth trend (will I run out in X days?)
- Which container logs are growing fastest
- Unused images/volumes count
- Build cache size

**What to show:**

```
Docker Storage: 42GB / 100GB (2 days until full)
├─ Images: 12GB (3 unused)
├─ Containers: 8GB (logs: redis 1.2GB) [Truncate]
├─ Volumes: 15GB (2 orphaned)
└─ Build cache: 7GB
[Prune Unused] [Clean Logs] [View Details]
```

**LuminaDev status:** 🔄 Phase 2 has prune preview. Need trend analysis.

---

### 10. Port Allocation Status

**What developers need to know:**

- Which ports are claimed by project services
- Conflicts (two services want same host port)
- Exposed but unmapped ports (security risk)
- Port forwarding rules (host:container)
- Available ports for new services

**What to show:**

```
Ports:
✅ 3000:3000 (api) → http://localhost:3000
✅ 5432:5432 (db) → postgres://localhost:5432
⚠ 6379 (redis) → CONFLICT with system redis
❌ 8080:8080 → port not responding
[Fix Conflict] [Map Port]
```

**LuminaDev status:** ❌ Not implemented. Phase 2 has port remap for containers.

---

## TIER 3: CHECK EVERY 30 MINUTES (Context & Collaboration)

### 11. Team Activity

**What developers need to know:**

- Recent commits from teammates (last 24h)
- Open PRs needing review
- CI/CD pipeline status for team branches
- Issues assigned to you
- @mentions in comments

**What to show:**

```
Team Activity (last 2h)
├─ @alice opened PR #42 "feat: rate limiting" [Review]
├─ @bob pushed to staging (build ✅ passing)
├─ CI/CD: main branch failing (test #3)
└─ 2 new issues assigned to you [View]
```

**LuminaDev status:** ✅ Phase 12 Cloud Git has this. Need to integrate into Dashboard.

---

### 12. Environment Drift Detection

**What developers need to know:**

- Remote branch updates (someone pushed to main)
- Dependency lockfile changed remotely
- Compose file changed (different from running state)
- .env.example updated (new required vars)
- Schema migrations pending

**What to show:**

```
Drift Detected (3 changes since last session)
├─ main is 5 commits behind origin [Pull]
├─ package.json updated (node_modules outdated) [Install]
└─ .env.example added DATABASE_URL [Add to .env]
[Sync All] [Review Changes]
```

**LuminaDev status:** ❌ Not implemented. New feature needed.

---

### 13. Database Schema Status

**What developers need to know:**

- Pending migrations (not applied)
- Last migration applied (time + version)
- Schema vs ORM model mismatch
- Seed data status (loaded/outdated)
- Connection pool health

**What to show:**

```
Database: 🟡 migration pending
├─ Pending: 20240101_add_users_table
├─ Last: 20231201_init_schema (2 weeks ago)
├─ ORM: ✅ schema matches
└─ Seeds: ⚠ outdated (run `npm run db:seed`)
[Migrate] [Seed] [View Schema]
```

**LuminaDev status:** ❌ Not implemented. Needs database introspection.

---

### 14. Framework-Specific Health

**What developers need to know (by framework):**

**Next.js:**

- HMR status (connected/failed)
- Compile errors (file + line)
- Bundle size warnings
- Slow page detection

**React/Vite:**

- Fast Refresh status
- Dependency pre-bundling
- CSS hot reload

**Node.js:**

- Event loop lag
- Memory leak detection
- Async resource tracking

**Python (Django/Flask):**

- Auto-reload status
- Template errors
- Migration status

**What to show:**

```
Framework: Next.js v14
├─ HMR: ✅ connected (2ms latency)
├─ Build: 🔴 error in pages/index.tsx:42
└─ Bundle: ⚠ 1.2MB (vendor chunk 800KB)
[Open File] [Fix Error] [Analyze Bundle]
```

**LuminaDev status:** ❌ Not implemented. Framework adapters needed.

---

### 15. Session Memory & Resume

**What developers need to know (Monday morning):**

- What was I working on?
- Which files were open?
- What terminal commands were running?
- What was the last git branch?
- Were there uncommitted changes?
- What services were up?
- Any errors from last session?

**What to show (on app open):**

```
Resume Session from Friday 5:32 PM
├─ Branch: feature/rate-limiting (3 uncommitted files)
├─ Open files: auth.ts, middleware.ts
├─ Services: api:3000, db:5432 (redis was down)
├─ Last command: npm run test -- --watch
└─ Error: Rate limiter config missing
[Resume Session] [Start Fresh] [View Last Logs]
```

**LuminaDev status:** ❌ Not implemented. Needs session persistence.

---

## THE COMPLETE DASHBOARD LAYOUT

Now assemble ALL 15 into a single, scrollable dashboard:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  ACTIVE SESSION · my-api-project                                        ⚡ Live │
│  Last active: 2 min ago | Project health: 🟡 5 issues need attention           │
├─────────────────────────────────────────────────────────────────────────────────┤
│  PROJECT HEALTH DASHBOARD (Critical issues first)                               │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐          │
│  │ Git      │ Services │ Build    │ Deps     │ Env      │ Storage  │          │
│  │ 🟢 Clean │ 🟡 1 down │ 🔴 Fail  │ 🟡 2 CVE │ 🔴 2 miss│ 🟢 42GB  │          │
│  └──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────┐ │
│  │ GIT STATUS              │  │ RUNNING SERVICES         │  │ ACTIVE JOBS     │ │
│  │ main · 3Δ (+42/-12)     │  │ ✅ api:3000 (2h)         │  │ ██░░ npm audit  │ │
│  │ ↑2 ahead ↓0 behind      │  │ ✅ db:5432 (2h)          │  │ ████ docker pull│ │
│  │ [Push] [Pull] [Commit]  │  │ ❌ redis:6379 (3m ago)   │  │ [Cancel]        │ │
│  └─────────────────────────┘  │ [Restart] [Logs]         │  └─────────────────┘ │
│                               └─────────────────────────┘                      │
│                                                                                 │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────┐ │
│  │ ENVIRONMENT VARIABLES   │  │ DEPENDENCY HEALTH       │  │ BUILD STATUS    │ │
│  │ 🔴 MISSING: 2 vars      │  │ 🟡 CVE-2024-1234 (axios)│  │ 🔴 FAILED       │ │
│  │ DATABASE_URL (db req)   │  │ ⚠ outdated: lodash      │  │ auth.ts:23      │ │
│  │ REDIS_URL (cache req)   │  │ ✅ lockfile: synced     │  │ 3/42 tests fail │ │
│  │ [Create .env]           │  │ [npm audit fix]         │  │ [View Logs]     │ │
│  └─────────────────────────┘  └─────────────────────────┘  └─────────────────┘ │
│                                                                                 │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────┐ │
│  │ CONTAINER RESOURCES     │  │ DOCKER STORAGE          │  │ PORT STATUS     │ │
│  │ api: 45% CPU/312MB RAM  │  │ 42GB/100GB (2d left)    │  │ ✅ 3000:3000    │ │
│  │ db:  12% CPU/256MB RAM  │  │ logs: redis 1.2GB       │  │ ✅ 5432:5432    │ │
│  │ redis: DOWN             │  │ images: 12GB (3 unused) │  │ ❌ 6379 conflic│ │
│  │ [Adjust Limits]         │  │ [Prune] [Clean Logs]    │  │ [Fix Conflict]  │ │
│  └─────────────────────────┘  └─────────────────────────┘  └─────────────────┘ │
│                                                                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ACTIVITY FEED (Last 2 hours)                      [Filter: All ▼] [Auto-scroll] │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │ [now]    🔴 Build failed: Type error in src/api/auth.ts:23                  ││
│  │ [2m]     🟡 Job: npm audit fix (15% complete)                               ││
│  │ [5m]     ✅ Git: commit "fix: auth" pushed to origin/main                   ││
│  │ [12m]    ❌ Docker: redis exited (OOM killer)                               ││
│  │ [15m]    ⚠ Env: DATABASE_URL missing, db service will fail                 ││
│  │ [22m]    📦 Deps: axios@1.5.0 has critical CVE                             ││
│  │ [34m]    💻 Terminal: `npm run dev` started (pid 1234)                     ││
│  │ [1h]     👥 Team: @alice opened PR #42 "feat: rate limiting"               ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│  NEXT ACTIONS (Smart suggestions based on current state, by priority)          │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │ 1. 🔴 CRITICAL: Fix build error in src/api/auth.ts:23                      ││
│  │ 2. 🔴 CRITICAL: Add missing DATABASE_URL to .env                           ││
│  │ 3. 🟡 HIGH: Update axios to fix CVE-2024-1234 (npm audit fix)              ││
│  │ 4. 🟡 HIGH: Restart redis container (OOM killer)                           ││
│  │ 5. 🟢 MEDIUM: Pull latest changes (main is 5 commits behind)               ││
│  │ 6. ⚪ LOW: Review PR #42 from @alice                                       ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│  TERMINALS (3 active)                          │  DRIFT DETECTION              │
│  ┌────────────────────────────┐               ┌────────────────────────────┐  │
│  │ 💻 npm run dev (3000)      │               │ ⚠ 3 changes since last    │  │
│  │   22m ago · "ready in 2.3s"│               │    session:               │  │
│  │   [Focus] [Kill]           │               │ • main is 5 behind origin │  │
│  ├────────────────────────────┤               │ • package.json updated    │  │
│  │ 🐳 docker logs -f redis    │               │ • .env.example changed    │  │
│  │   12m ago · "OOM killer"   │               │ [Sync All] [Review]       │  │
│  │   [Focus] [Kill]           │               └────────────────────────────┘  │
│  ├────────────────────────────┤                                               │
│  │ 📝 tail -f app.log         │               TEAM ACTIVITY                  │
│  │   2m ago · "ERROR: conn..."│               ┌────────────────────────────┐  │
│  │   [Focus] [Kill]           │               │ • PR #42 needs review      │  │
│  └────────────────────────────┘               │ • staging deploy ✅ passing│  │
│                                                │ • 2 issues assigned to you │  │
│                                                │ [View] [Review]            │  │
│                                                └────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## IMPLEMENTATION ROADMAP FOR LUMINADEV

### Phase A: Foundation (Week 1) — What you can build NOW

| Feature                      | Complexity | Depends On     | Status            |
| ---------------------------- | ---------- | -------------- | ----------------- |
| Git status panel             | Low        | Phase 4 exists | ✅ Ready          |
| Running services panel       | Medium     | Phase 2 exists | 🔄 Need filtering |
| Activity feed (Docker + Git) | Medium     | Event system   | ❌ Need to build  |
| Active jobs panel            | Low        | Phase 0 exists | ✅ Ready          |

### Phase B: Environment Health (Week 2-3)

| Feature                       | Complexity | Depends On                  |
| ----------------------------- | ---------- | --------------------------- |
| Environment variables panel   | Medium     | Phase 8 Settings            |
| Dependency health             | High       | Package manager integration |
| Build pipeline status         | Medium     | Job Runner + parsers        |
| Container resources (project) | Medium     | Phase 5 Monitor + labels    |

### Phase C: Context & Collaboration (Week 4-5)

| Feature           | Complexity | Depends On            |
| ----------------- | ---------- | --------------------- |
| Team activity     | Medium     | Phase 12 Cloud Git    |
| Environment drift | High       | Session persistence   |
| Port allocation   | Low        | Phase 2 Docker        |
| Docker storage    | Medium     | Phase 2 prune preview |

### Phase D: Advanced Features (Week 6-8)

| Feature               | Complexity | Depends On           |
| --------------------- | ---------- | -------------------- |
| Session memory/resume | High       | Phase 9 Profiles     |
| Database schema       | High       | DB introspection     |
| Framework health      | High       | Framework adapters   |
| Terminal management   | High       | PTY session tracking |

---

## TECHNICAL SPECS FOR EACH FEATURE

### 1. Git Status Panel

```typescript
// IPC Contract
interface GitStatusResponse {
  branch: string;
  ahead: number;
  behind: number;
  modified: string[];
  staged: string[];
  deleted: string[];
  untracked: string[];
  stashCount: number;
  lastCommit: {
    hash: string;
    message: string;
    time: string;
  };
  inProgress: "merge" | "rebase" | "cherry-pick" | null;
}

// Tauri Command
#[tauri::command]
async fn git_status(project_path: String) -> Result<GitStatusResponse, String>
```

### 2. Running Services Panel

```typescript
interface ServiceStatus {
  name: string
  status: 'running' | 'exited' | 'paused' | 'restarting'
  hostPort: number | null
  containerPort: number
  health: 'healthy' | 'unhealthy' | 'starting' | null
  uptime: number // seconds
  lastLogLine: string
  restartCount: number
}

// Parse from docker-compose.yml + docker ps --filter
```

### 3. Activity Feed

```typescript
interface ActivityEvent {
  id: string
  timestamp: string
  type: 'docker' | 'git' | 'job' | 'terminal' | 'build' | 'env' | 'team'
  severity: 'info' | 'warning' | 'error' | 'success'
  source: string // container name, command, etc.
  message: string
  action?: {
    label: string
    command: string
    params: any
  }
}

// Event sources to capture:
// - Docker events API (docker events --filter)
// - Git post-commit hooks
// - Job Runner state changes
// - Terminal command execution
// - Build script output parsing
```

### 4. Environment Variables Panel

```typescript
interface EnvValidation {
  required: string[] // from .env.example
  present: string[] // from .env
  missing: string[]
  overridden: Array<{ var: string; default: string; current: string }>
  secrets: string[] // API keys, tokens detected
  perService: Record<string, string[]> // service -> vars used
}
```

### 5. Dependency Health

```typescript
interface DependencyHealth {
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'cargo' | 'pip' | 'go'
  lockfileSynced: boolean
  outdated: Array<{ name: string; current: string; latest: string }>
  vulnerabilities: Array<{ package: string; severity: string; cve: string }>
  deprecated: string[]
  peerConflicts: string[]
}
```

### 6. Build Pipeline Status

```typescript
interface BuildStatus {
  lastBuild: {
    timestamp: string
    success: boolean
    duration: number
    error?: {
      file: string
      line: number
      message: string
    }
  }
  tests: {
    total: number
    passed: number
    failed: Array<{ name: string; error: string }>
    duration: number
  }
  lint: {
    errors: number
    warnings: number
    worstOffender?: string
  }
  trend: 'faster' | 'slower' | 'stable'
}
```

### 7. Container Resources (Project-Specific)

```typescript
interface ContainerResource {
  name: string
  cpu: {
    current: number // percent
    limit: number
    throttled: boolean
  }
  memory: {
    current: number // MB
    limit: number
    percent: number
  }
  disk: {
    read: number // MB/s
    write: number
  }
  network: {
    rx: number // MB/s
    tx: number
  }
}
```

### 8. Docker Storage Health

```typescript
interface DockerStorageHealth {
  totalUsage: number // GB
  totalCapacity: number // GB
  daysUntilFull: number // based on growth rate
  breakdown: {
    images: number
    containers: number
    volumes: number
    buildCache: number
  }
  logGrowth: Array<{ container: string; size: number; rate: string }>
  unused: {
    images: number
    volumes: number
  }
}
```

### 9. Port Allocation

```typescript
interface PortStatus {
  allocated: Array<{
    service: string
    hostPort: number
    containerPort: number
    status: 'responding' | 'not responding' | 'conflict'
    url?: string
  }>
  conflicts: Array<{
    ports: number[]
    processes: string[]
  }>
  exposedUnmapped: number[] // security risk
  available: number[] // for new services
}
```

### 10. Team Activity

```typescript
interface TeamActivity {
  recentCommits: Array<{
    author: string
    hash: string
    message: string
    time: string
    branch: string
  }>
  openPRs: Array<{
    id: string
    title: string
    author: string
    needsReview: boolean
    url: string
  }>
  ciStatus: Record<string, 'passing' | 'failing' | 'pending'>
  assignedIssues: Array<{
    id: string
    title: string
    provider: 'github' | 'gitlab'
  }>
  mentions: Array<{
    from: string
    message: string
    url: string
  }>
}
```

### 11. Environment Drift Detection

```typescript
interface DriftDetection {
  git: {
    behind: number
    remoteChanges: string[]
  }
  dependencies: {
    lockfileChanged: boolean
    newPackages: string[]
    removedPackages: string[]
  }
  compose: {
    changed: boolean
    differences: string[]
  }
  env: {
    newRequired: string[]
    removedRequired: string[]
  }
  migrations: {
    pending: string[]
  }
}
```

### 12. Database Schema Status

```typescript
interface DatabaseSchemaStatus {
  migrations: {
    applied: Array<{ version: string; appliedAt: string }>
    pending: string[]
  }
  orm: {
    sync: boolean
    mismatches: string[]
  }
  seeds: {
    loaded: boolean
    lastRun: string
    needsRefresh: boolean
  }
  connectionPool: {
    active: number
    idle: number
    waiting: number
    max: number
  }
}
```

### 13. Framework Health (Next.js Example)

```typescript
interface FrameworkHealth {
  name: 'nextjs' | 'react' | 'vite' | 'node' | 'django' | 'flask'
  hmr: {
    connected: boolean
    latency?: number
    errors?: string[]
  }
  build: {
    status: 'passing' | 'failing' | 'building'
    errors?: Array<{ file: string; line: number; message: string }>
    bundleSize?: number
  }
  performance: {
    slowModules?: string[]
    eventLoopLag?: number
  }
}
```

### 14. Session Memory

```typescript
interface SessionSnapshot {
  id: string
  timestamp: string
  project: string
  branch: string
  uncommittedFiles: string[]
  openFiles: string[] // from editor extension
  runningServices: string[]
  terminalCommands: Array<{ cwd: string; command: string }>
  lastError?: string
  environment: Record<string, string>
}

// Auto-save every 5 minutes + on app close
// Restore on next launch with "Resume" button
```

---

## RUST BACKEND MODULE STRUCTURE

```rust
// apps/desktop/src-tauri/src/dashboard/mod.rs
mod git_status;
mod services;
mod activity_feed;
mod env_validation;
mod dependency_health;
mod build_status;
mod container_resources;
mod docker_storage;
mod port_allocation;
mod team_activity;
mod drift_detection;
mod database_schema;
mod framework_health;
mod session_memory;

// Each module follows pattern:
// pub async fn get_xxx(payload: Value, state: &AppState) -> Result<Value>
// fn parse_xxx() -> private helpers
// #[cfg(test)] mod tests
```

---

## PRIORITY MATRIX FOR LUMINADEV

| Feature           | Value  | Effort | Dependency      | Do First?  |
| ----------------- | ------ | ------ | --------------- | ---------- |
| Git status        | High   | Low    | Phase 4 exists  | ✅ Yes     |
| Running services  | High   | Medium | Phase 2 exists  | ✅ Yes     |
| Activity feed     | High   | Medium | None            | ✅ Yes     |
| Active jobs       | Medium | Low    | Phase 0 exists  | ✅ Yes     |
| Environment vars  | High   | Medium | Phase 8         | ⏳ Wait    |
| Build status      | High   | High   | Job Runner      | ⏳ Wait    |
| Dependency health | Medium | High   | Package mgr     | ⏳ Wait    |
| Drift detection   | Medium | High   | Session store   | ⏳ Wait    |
| Session memory    | High   | High   | Phase 9         | ⏳ Wait    |
| Team activity     | Medium | Medium | Phase 12 exists | ✅ Partial |

---

## FINAL ANSWER TO YOUR QUESTION

**"What does a developer working on a Docker-isolated project need to know at most?"**

**The 15 things above.**

Your original concept had 3 (Git, Services, Activity).
The missing 12 are:

1. Environment variables
2. Dependency health
3. Build pipeline status
4. Container resources (project-specific)
5. Docker storage health
6. Port allocation
7. Team activity
8. Environment drift
9. Database schema
10. Framework health
11. Session memory
12. Terminal management

**Build the Tier 1 features first** (Git, Services, Jobs, Activity Feed).
**Then Tier 2** (Env, Build, Dependencies, Resources).
**Then Tier 3** (Team, Drift, Database, Framework, Session).

---

## What Changes Per Profile (Complete Matrix)

| Dashboard Component     | Data Science                                             | Web Dev                                             | Game Dev (Godot)                                           | Mobile (React Native)                                         | Infra/K8s                                            |
| ----------------------- | -------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------- |
| **Services to monitor** | Jupyter, Postgres, MinIO, MLflow                         | Next.js, Postgres, Redis, Nginx                     | Godot server, Redis, Asset pipeline                        | Metro bundler, Android emulator, iOS sim                      | Traefik, Prometheus, Grafana, Portainer              |
| **Ports**               | 8888, 5432, 9000, 5000                                   | 3000, 5432, 6379, 8080                              | 7357, 6379, 8080                                           | 8081, 19000, 19001                                            | 80, 443, 9090, 3000, 9000                            |
| **Package manager**     | pip, conda                                               | npm, pnpm, yarn                                     | -                                                          | npm, expo, cocoapods                                          | helm, kubectl, terraform                             |
| **Dependencies file**   | requirements.txt, environment.yml                        | package.json, pnpm-lock.yaml                        | -                                                          | package.json, Podfile                                         | go.mod, Chart.yaml                                   |
| **Required env vars**   | DATASET_PATH, MLFLOW_TRACKING_URI, MODEL_REGISTRY        | DATABASE_URL, REDIS_URL, JWT_SECRET, API_KEY        | GODOT_SERVER_PORT, ASSET_PATH                              | EXPO_PUBLIC_API_URL, ANDROID_HOME, IOS_SIMULATOR              | KUBECONFIG, HELM_REPO, TERRAFORM_TOKEN               |
| **Build command**       | `jupyter nbconvert --to notebook`                        | `npm run build`                                     | `godot --export`                                           | `npm run build` or `expo build`                               | `helm upgrade --install`                             |
| **Test command**        | `pytest tests/`                                          | `npm test`                                          | `gdunit`                                                   | `jest --watch`                                                | `go test ./...`                                      |
| **Framework health**    | Jupyter kernel, Dask cluster, TensorBoard                | Next.js HMR, webpack, Vite                          | Godot headless, GDScript LSP                               | Metro bundler, Fast Refresh                                   | Kubernetes API, Prometheus targets                   |
| **Database type**       | PostgreSQL (TimescaleDB), InfluxDB                       | PostgreSQL, Redis                                   | PostgreSQL, Redis                                          | SQLite, Firebase                                              | etcd, PostgreSQL                                     |
| **Migration tool**      | Alembic, Flyway                                          | Prisma, TypeORM                                     | -                                                          | TypeORM, Realm                                                | Flyway, Liquibase                                    |
| **Storage volumes**     | /data/datasets, /models, /notebooks                      | /uploads, /cache, /logs                             | /assets, /builds                                           | /android, /ios                                                | /kubeconfig, /helm-cache                             |
| **Git hooks**           | pre-commit (black, flake8)                               | pre-commit (prettier, eslint, tsc)                  | pre-commit (format)                                        | pre-commit (lint, format, typecheck)                          | pre-commit (terraform fmt, kubeval)                  |
| **Terminal context**    | conda activate ds, jupyter kernels                       | nvm use 18, npm run dev                             | godot --path                                               | nvm use 20, expo start                                        | kubectl ctx, helm repo update                        |
| **CI/CD integration**   | GitHub Actions (ML pipeline)                             | Vercel, Netlify, GitHub Actions                     | GitHub Actions, Itch.io                                    | EAS, Bitrise, GitHub Actions                                  | GitLab CI, ArgoCD, Jenkins                           |
| **Team activity focus** | Model registry updates, Experiment tracking              | PRs, deployments, staging status                    | Build artifacts, asset commits                             | Testflight, app store releases                                | Cluster health, deployment rollouts                  |
| **Common errors**       | OOM during training, CUDA out of memory, Missing dataset | Type errors, Port conflicts, Redis OOM, Build fails | Asset missing, Export config wrong, Godot version mismatch | Metro bundler cache, Simulator boot timeout, Pod install fail | Helm template error, RBAC denied, API deprecated     |
| **Storage concerns**    | Model files (GBs), Dataset cache, MLflow artifacts       | node_modules (hundreds MB), Build cache, Logs       | Asset files (textures/audio), Build artifacts              | Build caches, Simulator images, Pods cache                    | Helm charts cache, Terraform state, Container images |

---

## The Key Insight

**The dashboard isn't a generic tool. It's a chameleon that transforms completely based on which profile you're in.**

When you switch from Data Science to Web Dev:

- Jupyter port 8888 → Next.js port 3000
- pip dependencies → npm dependencies
- Dataset path env var → API key env var
- Jupyter kernel health → Next.js HMR status
- MLflow tracking → CI/CD pipeline
- Model training jobs → Build jobs

**This is why Phase 9 (Profiles) is so critical.** Without proper profile management, the dashboard can't know what to show.

---

## Implementation Priority for LuminaDev

Given this profile-aware requirement:

1. **Phase 9 (Profiles) must come BEFORE Dashboard v2**
   - Without profiles, dashboard doesn't know context
   - Profile switching is the core UX

2. **Each profile needs its own configuration**
3. **Dashboard renders based on profile schema**
   - Generic layout with profile-specific data sources
   - Each panel asks: "What does this profile need?"

4. **Profile switching = full dashboard re-evaluation**
   - Clear all caches
   - Re-fetch all health checks
   - Re-render all panels
   - Update terminal contexts

---

## Bottom Line

**Yes, everything changes when you switch profiles.**

That's not a bug—it's the **core feature**. The dashboard becomes a shape-shifter that matches exactly what you're working on, whether you're training ML models, building web apps, or orchestrating Kubernetes clusters.
