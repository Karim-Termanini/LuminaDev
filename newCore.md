# KeelDev AI Integration — Detailed Technical Plan

## Executive Summary

KeelDev transforms from a dashboard into **"The Unified AI Developer Control Plane for Linux"** — a lightweight orchestration layer that sits between your IDEs and AI models, solving the fundamental problems that no single IDE can solve alone.

**Core Philosophy:** Don't rewrite existing tools. Call them via subprocess. Orchestrate them with <1500 lines of Rust code.

---

## The Problems We're Solving

### Problem 1: Credit Limits & 4 IDEs Chaos
- You open 4 different IDEs (Cursor, VSCode, Zed, etc.) just to manage free credits
- Each IDE has its own settings, skills, hooks, and marketplace
- No unified way to manage API keys or switch between models
- You waste money because the same context is sent to multiple models across IDEs

### Problem 2: Heavy Local AI & Resource Drain
- Local models (7B-13B) consume 8-16GB RAM
- Laptop batteries drain in 2 hours
- Models forget context quickly due to limited context windows
- No compression before sending to LLM → wasted tokens → wasted money

### Problem 3: AI Memory Loss & Context Fragmentation
- AI forgets everything between sessions
- Project memory is tied to a single IDE — switch IDE, lose context
- No unified understanding of code structure across tools
- Multiple project files conflict when trying to merge memory across IDEs

### Problem 4: Git Identity Chaos
- Mixing work vs personal commits in the same project
- History shows wrong authors
- SSH keys get mixed up
- Have to manually switch identities every time you change directories

### Problem 5: Linux Beginner Hell
- PATH variable confusion — Python/Node installed but not found
- Don't know how to install programming languages
- Errors (hardware/software) require hours of internet searching
- No one-click fixes — everything is a terminal command they don't understand

---

## The Solution Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      USER'S MACHINE                            │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │  Cursor  │  │  VSCode  │  │   Zed    │  │  Others  │     │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘     │
│       │             │             │             │             │
│       └─────────────┴─────────────┴─────────────┘             │
│                     │                                          │
│                     ▼                                          │
│         ┌─────────────────────────┐                           │
│         │   KeelDev AI Proxy    │                           │
│         │   (OpenAI-compatible)   │                           │
│         │   localhost:4317        │                           │
│         └───────────┬─────────────┘                           │
│                     │                                          │
│     ┌───────────────┼───────────────┐                         │
│     │               │               │                         │
│     ▼               ▼               ▼                         │
│ ┌─────────┐  ┌──────────┐  ┌─────────────┐                   │
│ │Knowledge│  │Context   │  │System/Git   │                   │
│ │Graph    │  │Compressor│  │Autopilot    │                   │
│ │Engine   │  │(Headroom)│  │(Odysseus)   │                   │
│ └─────────┘  └──────────┘  └─────────────┘                   │
│     │              │              │                           │
│     └──────────────┼──────────────┘                           │
│                    │                                          │
│                    ▼                                          │
│          ┌─────────────────┐                                  │
│          │  LLM Backend    │                                  │
│          │  (Ollama +      │                                  │
│          │   Cloud APIs)   │                                  │
│          └─────────────────┘                                  │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │         Background File Watcher                        │  │
│  │   (Auto-updates Knowledge Graph)                       │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component 1: AI Proxy (OpenAI-Compatible API Server)

### What It Does
- Runs on `http://localhost:4317` as a drop-in replacement for OpenAI API
- All IDEs point to this endpoint instead of OpenAI directly
- Single place to manage API keys, model selection, and routing
- Handles authentication and credit tracking

### How It Works (No Code)
1. User configures their API keys (OpenAI, Anthropic) once in KeelDev settings
2. User can also enable local models (Ollama) as an option
3. All IDE requests go through the proxy
4. Proxy routes requests based on priority: local first, cloud for complex tasks
5. Proxy injects project context (from Knowledge Graph) before forwarding to LLM
6. Proxy applies context compression (Headroom) to save tokens
7. All IDE traffic is unified under one credit/usage dashboard

### What We Use
- **`agentsview`**: Embedded local-first analytics dashboard to track token consumption, compute costs, and session statistics.
- **`LMCache`**: KV cache manager integration for local LLMs (Ollama) to share/reuse KV prefixes across requests and lower generation latency.
- **`stop-slop`**: System prompt formatting directives injected into the proxy to filter out passive AI writing clichés and formulaic prose from code comments and descriptions.
- **`system_prompts_leaks`**: Prompt-hardening templates used to secure KeelDev's system prompts against malicious jailbreak and instruction leakage attempts.

### What We Build
- HTTP server with `/v1/chat/completions` endpoint
- Request/response interception middleware
- Model routing logic (local vs cloud) with LMCache prefix caching
- Local API key authentication (generates a unique token on first run, stored in `~/.config/keel/token`, which the IDE must pass in `Authorization: Bearer <token>` to prevent malicious browser page attacks)
- Cost, token, and performance statistics dashboard powered by `agentsview` log schema

### What We Don't Build
- Our own LLM
- Complex load balancing
- User management system
- Payment processing

---

## Component 2: Knowledge Graph Engine

### What It Does
- Builds a persistent understanding of your project structure
- Tracks relationships between files, functions, classes, and dependencies
- Updates automatically as you change code
- Provides context to AI without reading entire files every time
- Works across all IDEs because it's system-level
- Automatically generates and keeps `AGENTS.md` in sync at the project root

### How It Works (No Code)
1. **Background Indexing:** KeelDev watches your project folders using filesystem events
2. **AST Analysis:** For each code file, it uses `graphify` (Python) to build an Abstract Syntax Tree (AST)
3. **Relationship Mapping:** It identifies which functions call which, class inheritance, import dependencies
4. **Graph Storage:** All relationships stored as a graph in memory (Rust's `petgraph`)
5. **Query Interface:** When AI asks about code, it queries the graph instead of reading files
6. **Auto-Sync:** On file save, the graph updates incrementally (not full rebuild)
7. **AGENTS.md Exporter:** Periodically compiles the high-level codebase map, test conventions, and coding rules into a root `AGENTS.md` file so external agents (Cursor, Claude Code) read it automatically on project launch
8. **Persistence:** Graph stored in `~/.keel/graphs/<project_hash>.json`

### What We Use
- **`graphify`** (Python): Called via subprocess to parse code files and generate AST structure maps.
- **`codegraph`**: Concept and schema layout for indexing codebase symbols and maintaining call graph relationships.
- **`Understand-Anything`**: Context analyzer that extracts business flows (e.g., auth, payment) from the AST and flags them to the AI proxy.
- `notify` (Rust crate): Filesystem watcher
- `petgraph` (Rust crate): Graph data structure in memory

### What We Build
- File watcher that triggers on project directory changes
- Graphify wrapper (Rust calls `python3 graphify.py <dir>` and parses JSON)
- Graph update logic (incremental vs full rebuild)
- Graph query API for AI context injection

### What We Don't Build
- AST parser (graphify does this)
- Language-specific parsers (graphify handles multiple languages)

---

## Component 3: Context Compressor (Headroom Integration)

### What It Does
- Reduces prompt size by 60-95% before sending to LLM
- Preserves semantic meaning while removing redundancy
- Works on logs, command outputs, code snippets, and RAG results
- Saves money on cloud APIs
- Reduces memory pressure on local models

### How It Works (No Code)
1. **Pre-compression Analysis:** Before any LLM request, we process the prompt through compression
2. **Token Counting:** Estimate how many tokens this will consume
3. **Smart Pruning:**
   - Remove duplicate lines from logs
   - Summarize long command outputs (keep first/last N lines)
   - Extract only relevant code sections (skip boilerplate)
   - Remove comments and whitespace where possible
4. **Pass Through:** Compressed context passed to LLM
5. **Post-Processing:** When model returns, responses are expanded back for user readability if needed

### What We Use
- **`headroom`** (Python): Main subprocess engine for context/token pruning.
- Custom Rust tokenizer for quick token length estimations. 

### What We Build
- Subprocess daemon wrapper for headroom (run as a persistent long-running background process communicating via stdin/stdout to eliminate 50-200ms Python startup overhead on each chat message)
- Fallback/Direct compression in Rust (port the core text cleanup rules, comment-stripping, and whitespace pruning directly to Rust for sub-millisecond execution)
- Integration into proxy pipeline (compress before forwarding)

### What We Don't Build
- Semantic analysis from scratch (headroom does this)
- Language-specific text compression (headroom handles this)

---

## Component 4: System/Git Autopilot

### What It Does
- Automatically fixes PATH issues
- Installs missing languages/tools with one click
- Detects and switches Git identities per project directory
- Diagnoses system errors and suggests/proposes fixes

### Sub-Component 4A: Git Context Switcher

**Problem:** Same project folder, different GitHub accounts (work vs personal). Manual switching leads to wrong authors, SSH key mixups, commit history conflicts.

**How It Works (No Code):**
1. KeelDev monitors the current working directory (from all IDEs via file system)
2. User defines rules: e.g., `/home/user/work/` = `company` identity, `/home/user/personal/` = `personal` identity
3. On directory change, Rust checks: "Is this a Git repo? What's the path?"
4. Automatically executes:
   - `git config user.name "Work Name"`
   - `git config user.email "work@company.com"`
   - Swaps SSH key in `~/.ssh/config` if needed
5. No manual intervention needed — it just works
6. Users see a subtle indicator in the dashboard: "Active Git Identity: Work/Personal"

### What We Use
- **`odysseus`**: Script execution library, vault storage logic for API/SSH credentials, and background task routines.
- **`oh-my-pi`**: CLI harness concepts to run local system commands and query LSPs.
- **`herdr`**: Rust terminal multiplexing server. Panes and terminal tabs in KeelDev are managed by `herdr` to keep terminal sessions sync'd with background agent states.

**What We Build:**
- Path-based rule engine (YAML config for users)
- File watcher that monitors IDE activity (via open file handles or current directory polling)
- Git config executor (runs `git config` commands)
- UI indicator in dashboard and terminal tabs managed by `herdr`

**What We Don't Build:**
- Git history rewriting tools
- GitHub API integration (we use local config only)

---

### Sub-Component 4B: PATH & Environment Manager

**Problem:** New users install Python but can't run `python` because PATH is missing `/usr/local/bin`. Or they install Node but it's not added to PATH. Or they don't know if something is installed at all.

**How It Works (No Code):**
1. **Discovery:** KeelDev scans common PATH locations (`/usr/bin`, `/usr/local/bin`, `~/.local/bin`, `~/.nvm`, etc.)
2. **Detection:** It checks if common runtimes are installed (Node, Python, Java, Go, Rust, etc.)
3. **Validation:** It runs `which python`, `node --version`, etc., to confirm they're accessible
4. **Fixes PATH Issues:**
   - If installed but not in PATH, it identifies the correct binary location
   - It checks `~/.bashrc`, `~/.zshrc`, `~/.profile` for PATH exports
   - If missing, it adds the correct `export PATH=$PATH:/path/to/bin` to the appropriate shell config
5. **One-Click Fix:** Shows the user: "Python is installed at /usr/bin/python3 but not in PATH. Fix it?" → User clicks "Fix" → It works
6. **Install Missing Tools:**
   - Uses distribution package manager (apt, dnf, pacman) detection
   - Runs `sudo apt install nodejs` or equivalent
   - Shows progress bar, not terminal output

**What We Build:**
- PATH scanning logic in Rust (check common directories)
- Shell config file parser (`~/.bashrc`, `~/.profile`, `~/.zshrc`)
- Distribution detection (which package manager?)
- Command execution wrapper with sudo handling via `pkexec`
- One-click fix UI button + IDE reload suggestion (prompts user to restart IDE, or launch it directly from KeelDev to inherit the updated environment variables)

**What We Don't Build:**
- Full package manager (we use existing ones)
- Distro-specific installers from scratch (we detect and call distro commands)

---

### Sub-Component 4C: Error Diagnoser & One-Click Fix

**Problem:** User sees a cryptic error (e.g., "docker: command not found" or "cannot allocate memory" or "port 8080 already in use"). They don't know what to do. Even if they Google, they might find outdated solutions.

**How It Works (No Code):**
1. **Error Capture:** KeelDev monitors system logs, Docker logs, command outputs
2. **Context Gathering:** Collects relevant information: error message, system state, installed packages, current configuration
3. **Search:** Calls `last30days-skill` (JavaScript) to search Reddit, HN, GitHub, YouTube for recent solutions
4. **Synthesis:** The local LLM (or cloud) reads the error + context + search results and proposes a solution
5. **One-Click Fix:** UI shows: "Error: port 8080 is already in use. Suggested fix: Kill process using port 8080 (PID: 1234). Execute?" → User clicks → It kills the process
6. **Feedback Loop:** If the fix works, it stores the solution. If not, it triggers a deeper search or suggests manual intervention

**What We Use:**
- **`last30days-skill`** (JavaScript): DuckDuckGo + HN + Reddit search aggregator.
- **`Agent-Reach`** (Python): Omnichannel scraper (Reddit, YouTube, Twitter/X, GitHub) to search the web without official API keys.
- **`chatwoot`**: Omnibus notification schema and inbox UI wrapper for triaging diagnostic reports.

**What We Build:**
- Error log collector (capture stderr from commands, system logs)
- Search wrapper (calls `last30days` or `Agent-Reach` Python scripts)
- Solution executor (execute shell commands with user confirmation)
- Unified notification box for errors and triage logs (derived from `chatwoot` UI layout)

**What We Don't Build:**
- Web crawler from scratch (use `last30days` or `Agent-Reach`)
- LLM training (use existing Ollama models)

---


---

## Component 7: Centralized Skill & Tool Registry (MCP Host)

### What It Does
- Manages and runs custom tools, agentic skills, and MCP servers in a single place
- Serves these skills globally to all connected IDEs (Cursor, VSCode, Zed)
- Automatically scans new skills for security threats, prompt injections, and data leaks

### How It Works (No Code)
1. **Registration:** User defines a custom skill (a Python/Node script or local server) in KeelDev
2. **Security Audit:** KeelDev automatically runs a static analysis scan on the skill script
3. **Host serving:** KeelDev hosts the skill as an MCP (Model Context Protocol) tool
4. **IDE Access:** When Cursor/VSCode queries the proxy, KeelDev advertises these tools
5. **Orchestrated Execution:** The LLM requests tool execution → KeelDev runs it locally and returns the result

### What We Use
- **`dify`**: Workflow/Tool definitions schema. We support running dify-like tool YAML structures.
- **`SkillSpector`** (NVIDIA): Static analysis engine to detect prompt injections and data leaks in registered scripts.
- **`pm-skills`** & **`Anthropic-Cybersecurity-Skills`**: Built-in skill packs loaded into the registry for workspace management and security checks.

### What We Build
- Local MCP Server Host
- NVIDIA `SkillSpector` subprocess executor for auditing new tools
- Visual tool configuration dashboard

---

## Component 5: Installation Wizard (First-Run Experience)

### The Three Questions

Based on student experience, the wizard asks exactly 3 questions:

1. **"What do you want to build?"**
   - Options: Web App, Mobile App, Data Science, CLI Tool, Game, Other
   - Determines: Language selection, frameworks, Docker compose profiles

2. **"Have you ever used the terminal before?"**
   - Options: Yes / No
   - Determines: Whether to show commands or hide them behind progress bars
   - "Yes" → Show me what's happening
   - "No" → Just show a progress bar with human-readable steps

3. **"Do you know what Git and GitHub are?"**
   - Options: Yes / No
   - Determines: Whether to set up Git identity and connect GitHub now
   - "Yes" → Prompt for name/email, offer GitHub OAuth
   - "No" → Silently set up local Git with defaults (user can learn later)

### What the Wizard Actually Does

1. **Readiness Check:** Scans system for prerequisites (RAM, CPU, Docker, Git, etc.) — Phase 16 from your existing plan
2. **Install Missing Tools:** Based on question #1, it installs the required languages (Node, Python, Java, etc.) using the package manager
3. **Fix PATH:** Automatically adds installed tools to PATH if not present
4. **Setup Git:** Based on question #3, configures Git user.name/user.email, generates SSH key if needed
5. **Create Starter Project:** Generates a minimal project in the chosen framework (e.g., `create-react-app` for web, `django-admin` for Python)
6. **Knowledge Graph Initialization:** Runs `graphify` on the new project to build the first knowledge graph
7. **Open Dashboard:** Lands the user on the main dashboard with:
   - Project ready in the workspace
   - Status cards showing installed tools
   - AI chat panel ready for questions
   - Docker services (if applicable) ready to start

---

## Component 6: Background File Watcher & Auto-Sync

### What It Does
- Monitors your project directories in real-time
- When files change, triggers incremental graph updates
- Automatically swaps Git identities on directory change
- Keeps everything in sync without user action

### How It Works (No Code)
1. **Watch:** Uses `notify` (Rust crate) to watch directories
2. **Event Handling:**
   - On file create/modify/delete → trigger graph update
   - On directory change → check Git identity rules
   - On project root change → reload context
3. **Performance:** Uses debouncing to avoid flooding the system with updates
4. **Graceful:** Works in the background, doesn't block the UI

### What We Use
- `notify` (Rust crate): Cross-platform file watching
- Debounce logic: Wait 500ms after last change before triggering update

### What We Build
- File watcher service in Rust
- Event debouncer
- Graph update trigger
- Git identity trigger

---

## What We're NOT Building (Clear Boundaries)

| NOT Building | Reason |
|--------------|--------|
| Rewriting Graphify in Rust | It's Python, works fine, we call it via subprocess |
| Rewriting Headroom in Rust | It's Python, works fine, we call it via subprocess |
| Rewriting last30days in Rust | It's JavaScript, works fine, we call it via Node |
| Rewriting Agent-Reach in Rust | It's Python, works fine, we call it via subprocess |
| Extracting Dify's workflow engine | 90k+ lines, too big. We build a tiny 200-line YAML runner |
| Training our own models | Use existing Ollama + GGUF models |
| Building a full IDE | We're a proxy and orchestration layer, not an IDE |
| Building an LSP server | Use existing rust-analyzer, pyright, etc. |
| Building a package manager | Use existing apt/dnf/pacman |
| Building a Git client | Use existing git CLI |

---

## Total Code We Actually Write (Estimate)

| Component | Rust Code | Additional Code |
|-----------|-----------|-----------------|
| AI Proxy Server | ~400 lines | - |
| Knowledge Graph Wrapper | ~200 lines | - |
| Context Compressor Wrapper | ~150 lines | - |
| Git Identity Switcher | ~100 lines | - |
| PATH Manager | ~150 lines | - |
| Error Diagnoser | ~200 lines | - |
| File Watcher | ~100 lines | - |
| Install Wizard Logic | ~150 lines | - |
| UI (React/TypeScript) | ~400 lines | ~400 lines |
| YAML Workflow Runner | ~200 lines | - |

**Total New Code: ~1,650 lines Rust + ~400 lines TypeScript**

All other functionality comes from calling existing tools via subprocess.

---

## How All Components Work Together (A Day in the Life)

### Scenario 1: New User First Launch

1. User downloads and opens KeelDev
2. Wizard launches (first-run detection)
3. Wizard asks 3 questions
4. Wizard installs Node.js, Python, Git (via package manager)
5. Wizard fixes PATH in `~/.bashrc`
6. Wizard creates a starter React project
7. Wizard runs `graphify` to build initial knowledge graph
8. Wizard completes → Dashboard opens
9. Project is visible in dashboard, ready to develop

---

### Scenario 2: Using KeelDev with an IDE

1. User opens VSCode and points it to the same project
2. KeelDev background watcher sees the directory is open
3. Knowledge graph is already built from the wizard
4. User installs Cursor and configures it to use `localhost:4317` as OpenAI endpoint
5. User enters OpenAI API key in KeelDev Settings (once)
6. User starts coding in Cursor
7. Cursor sends requests to KeelDev proxy
8. KeelDev:
   - Adds knowledge graph context to the prompt
   - Compresses the prompt with Headroom
   - Forwards to OpenAI API
   - Sends back the response
9. User switches to work on personal project in `/home/user/personal/`
10. KeelDev detects directory change and switches Git identity automatically
11. User switches to VSCode for personal project, same proxy works
12. All IDEs share the same context, knowledge, and API credits

---

### Scenario 3: Error Diagnosis

1. User tries to run `docker-compose up` and fails
2. KeelDev captures the error log
3. Error diagnoser activates:
   - Reads error: "port 8080 already in use"
   - Runs `lsof -i :8080` to find process using port
   - Searches `last30days` for "port 8080 already in use docker"
   - Synthesizes solution: "Kill process with PID 1234"
4. UI shows: "Error: port 8080 in use. Fix: Kill process 1234. Execute?"
5. User clicks "Fix"
6. KeelDev runs `kill -9 1234`
7. Success! User can run `docker-compose up` now

---

### Scenario 4: PATH Issue Detection

1. User tries `python` in terminal → `command not found`
2. KeelDev periodically scans PATH (or detects on command failure)
3. Finds: Python installed at `/usr/bin/python3` but `/usr/bin` is not in PATH
4. UI shows: "Python is installed but not in PATH. Fix it?"
5. User clicks "Fix"
6. KeelDev adds `export PATH=/usr/bin:$PATH` to `~/.bashrc`
7. User runs `source ~/.bashrc` (or KeelDev executes it)
8. `python` now works

---

## Complete Practical Scenario: Building an ExpenseTracker App with KeelDev (Omnibus Integration)

To make this plan concrete, here is a step-by-step walkthrough of how a developer uses KeelDev to build a personal expense tracking web application, utilizing our 18 local tools:

### 🎬 Step 1: Initialization & One-Click Setup (The Wizard)
1. The user opens KeelDev for the first time and clicks "New Project".
2. The Wizard asks exactly 3 questions:
   * **What do you want to build?** User selects `Web App (React + Node.js)`.
   * **Have you ever used the terminal before?** User selects `No` (prefers a simple visual interface).
   * **Do you know what Git and GitHub are?** User selects `Yes` and connects their GitHub account.
3. **In the background (silent, one-click execution):**
   * KeelDev detects that `Node.js` and `npm` are not installed. It automatically installs them using the environment modules from **`odysseus`**.
   * It detects that the PATH environment variable is missing the new runtimes and updates `~/.bashrc` automatically.
   * It calls the PM skills pack from **`pm-skills`** in the background to automatically design a starter database schema and write a skeleton PRD (Product Requirement Document).
   * It scaffolds a clean React + Node.js starter project using **`odysseus`** templates, initializes a local Git repository, and commits the initial project state.
   * It runs the indexer script from **`graphify`** in the background to build the initial Knowledge Graph mapping file dependencies and symbols.
   * It automatically generates the `AGENTS.md` file in the project root containing the project conventions and AST structure map.
   * It displays a prominent button: **[Open Project in Cursor / VS Code]**.

### 💻 Step 2: Coding & Token/Credit Optimization (The AI Proxy & Compression)
1. The user clicks the button, opening the project in their favorite IDE (e.g., Cursor).
2. The IDE (Cursor/Claude Code) automatically reads the generated `AGENTS.md` file from the root, immediately understanding the project layout and coding conventions without manual prompt explanations.
3. The IDE is pre-configured to point to the local KeelDev proxy (`http://localhost:4317`) instead of the default OpenAI servers, secured by a unique local API token (using **`system_prompts_leaks`** security patterns) to block malicious web browser attacks.
3. The user prompts the IDE's AI:
   > *"Create an expense input page and connect it to the Backend."*
4. **In the background (sub-second processing):**
   * The proxy intercepts the request and checks the active workspace graph generated by **`graphify`** and structured like **`codegraph`** to fetch a lightweight mapping of the React and Express code structure.
   * **`Understand-Anything`** extracts the business logic layer (Express routes, database operations) and injects it into the prompt.
   * It feeds the context to **`headroom`** (running as a persistent daemon in the background) to strip comments, whitespaces, and redundant files, compressing the prompt context by 85%.
   * It checks **`LMCache`** to see if a prefix KV cache for this repository context already exists in GPU/CPU memory to avoid reprocessing the entire system instruction set.
   * It applies **`stop-slop`** rules to the system prompt to instruct the LLM to output clean, natural, human-like code comments.
   * It forwards the compressed prompt to Ollama or a cloud LLM using the user's PAYG developer API keys.
5. **The Result:** The IDE generates and applies code changes quickly with **near-zero cost** in tokens and minimum latency on the host machine. The session cost and tokens are logged on the dashboard via **`agentsview`**.

### 🔀 Step 3: Automatic Git Profile Switching & Terminal (Git Context Switcher & herdr)
1. Mid-development, the user opens a company project in `/home/karim/work/project-x` to make a quick hotfix.
2. **Automatically:** The KeelDev File Watcher detects the workspace directory change and instantly switches the Git configuration:
   ```bash
   git config --local user.name "Karim Work Identity"
   git config --local user.email "karim@company.com"
   ```
   It also points to the company's SSH key in `~/.ssh/config` for that repository.
3. In the KeelDev terminal tab, **`herdr`** splits the terminal layout and displays the status of the background indexing agent.
4. The user makes the fix, commits, and pushes.
5. The commit goes to the company's repository with the correct work email and name. The user switches back to ExpenseTracker, and KeelDev automatically swaps back to their personal Git credentials.

### 🚨 Step 4: One-Click Linux Troubleshooting (Error Diagnoser)
1. While running the Express server in the IDE, the user encounters a port conflict:
   `Error: listen EADDRINUSE: address already in use :::3000`
2. KeelDev captures this error from the process logs.
3. The Diagnoser queries **`last30days-skill`** and **`Agent-Reach`** to search the web (Reddit, StackOverflow, HN) for solutions to this specific error on the current Linux distribution without needing official web search keys.
4. A notification appears on the KeelDev triage inbox (designed like **`chatwoot`**):
   > *"Port 3000 is blocked by a dangling Express process (PID: 5412). Would you like to terminate it and resolve the issue?"*
5. The user clicks **[Kill and Resolve]**.
6. The process is terminated, the port is freed, and the server starts successfully without the user having to search Google or run command line tools like `lsof` or `kill`.

### 🧠 Step 5: Hybrid AI Routing (Local vs. Cloud)
1. The user wants to work with both local models (for simple/fast tasks) and state-of-the-art cloud models like `Claude 3.5 Sonnet` (for complex architecture questions) in VSCode without paying $20/month subscriptions.
2. In KeelDev settings, the user enters their Anthropic API key once and downloads a lightweight local model (`Qwen-2.5-Coder-3B`) via Ollama.
3. In VSCode (e.g. using the Continue or Cline extension), the user configures the API endpoint to point to KeelDev's proxy at `http://localhost:4317/v1` using the local token.
4. **Scenario A (Inline Autocomplete - Local & Free):**
   * As the user writes code, the IDE requests an inline completion.
   * KeelDev's proxy intercepts the request, notes it is a lightweight completion request, and routes it to the local **Ollama** instance.
   * The code is completed instantly, offline, and for zero token cost.
5. **Scenario B (Complex System Design - Cloud & PAYG):**
   * The user opens the chat panel and asks: *"How do I migrate our database tables to SQLite cleanly without losing current record relationships?"*
   * VSCode sends the request to KeelDev.
   * KeelDev queries the local **Knowledge Graph** to understand the DB schemas, compresses the context by 85% via **`headroom`**, and routes it to the cloud **Anthropic API**.
   * The user receives a highly intelligent response from Claude 3.5 Sonnet, but because of headroom compression, the request only cost $0.01 instead of higher rates.
6. **Scenario C (Offline Mode Fallback):**
   * The user loses internet connectivity while traveling.
   * KeelDev detects the offline state and automatically switches all requests (even those originally targeted at cloud models) to fallback to the local Ollama models so development never halts.

## Timeline & Phasing

### Phase 0: Foundation (Weeks 1-2)
- Build AI Proxy server (OpenAI-compatible endpoint)
- Basic request/response handling
- Integrate with Tauri (Rust backend)

### Phase 1: Knowledge Graph (Weeks 3-4)
- Integrate `graphify` via subprocess
- Build file watcher with `notify`
- Graph storage in memory
- Query API for graph context

### Phase 2: Compression (Week 5)
- Integrate `headroom` via subprocess
- Add compression to proxy pipeline
- Token counting and logging

### Phase 3: Git & PATH Manager (Weeks 6-7)
- Git identity switcher with path-based rules
- PATH scanner and fixer
- Shell config parser/updater

### Phase 4: Error Diagnoser (Week 8)
- Integrate `last30days-skill`
- Error log collector
- Solution executor
- Solution cache

### Phase 5: Install Wizard (Weeks 9-10)
- First-run detection
- 3-question flow
- Runtime installer integration
- Project generator

### Phase 6: UI Integration (Weeks 11-12)
- Chat panel in dashboard
- Git identity indicator
- PATH issue notifications
- Error diagnosis panel
- Settings for API keys, identity rules, model preferences

### Phase 7: Testing & Polish (Weeks 13-14)
- Cross-distro testing (Ubuntu, Fedora, Arch)
- Performance optimization
- Documentation
- Beta release

---

## Success Metrics

| Metric | Target |
|--------|--------|
| New code written | < 2,000 lines Rust + < 500 lines TypeScript |
| Tools integrated via subprocess | 4-5 (graphify, headroom, last30days, Agent-Reach, oh-my-pi) |
| Token savings | 60-95% via Headroom compression |
| IDE support | Any IDE that supports OpenAI-compatible API |
| Install wizard completion | < 5 minutes for new users |
| PATH fix success rate | > 95% |
| Git identity switching | Automatic, no user intervention |
| Error diagnosis speed | < 5 seconds for common errors |
| Memory usage | < 512MB RAM (excluding LLM) |

---

## Key Differentiators

### Why KeelDev is Unique

1. **Not an IDE:** Works with your existing IDEs, doesn't replace them
2. **System-Level:** Solves PATH, environment, Git identity issues that IDEs can't touch
3. **Unified Context:** Knowledge graph shared across all tools
4. **Cost-Aware:** Compresses prompts to save money on cloud APIs
5. **Privacy-First:** Local models supported, local knowledge graph stored on your machine
6. **Beginner-Friendly:** One-click fixes for everything that normally requires terminal expertise
7. **Credit Unification:** One place to manage all API keys, all IDEs share them

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Subprocess overhead slows requests | Cache graph responses, use debouncing, run headroom as a background daemon, or use Rust-native fallback |
| Unauthorized local proxy queries | Require local token auth via `~/.config/keel/token` for all incoming IDE requests |
| Environment updates not visible in IDE | Advise restarting the IDE or launch IDEs directly from KeelDev GUI |
| Python/Node dependencies not installed | Ship common dependencies (Node/Python) in bundle, check at runtime |
| graphify fails on large projects | Implement incremental updates, limit graph depth |
| Headroom compression reduces quality | Allow users to disable compression, show compression preview |
| Local LLM too slow for some tasks | Route complex tasks to cloud, simple tasks local |
| Multi-distro compatibility | Test on Ubuntu, Fedora, Arch; use POSIX-compliant commands |
| Permission issues (sudo required) | Use `pkexec` for privilege escalation, guide users |

---

## Conclusion

This plan transforms KeelDev into **the brain of your development environment** without requiring us to rewrite the world. We orchestrate existing open-source tools (graphify, headroom, last30days, Agent-Reach) from a lightweight Rust proxy, providing:

- **Unified AI access** across all IDEs
- **Shared project memory** through knowledge graphs
- **Automatic environment management** (PATH, Git, runtimes)
- **One-click error diagnosis** powered by real-time web search
- **Zero-cost local AI** with compressed context and efficient quantization