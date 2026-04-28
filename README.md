# LuminaDev (HypeDevHome) 🚀

**A premium, Nordic-inspired developer workstation dashboard for Linux. Manage Docker containers, remote servers, and system resources through a stunning, unified interface.**

100% open-source developer dashboard for Linux, inspired by Microsoft Dev Home and the VS Code visual language. **Install target: Flatpak.** **Dev/CI: Docker-friendly.**

HypeDevHome is an advanced, all-in-one developer workspace designed to streamline Linux environment management. Built with a focus on performance and aesthetics, it bridges the gap between complex terminal operations and intuitive GUI control.

## ✨ Features

- **VS Code–style dark UI:** Codicons, Inter + JetBrains Mono fonts for a premium feel.
- **Docker Hub Explorer:** Integrated search and deployment directly from Docker Hub with smart tag selection.
- **Interactive Terminal:** Embedded terminal via `xterm.js` + `node-pty` with external-terminal fallback.
- **Container Management:** Dashboard with Docker container overview, compose “profile” cards, and logs.
- **System Metrics:** Real-time tracking of CPU, memory, disk, and network resources.
- **Git Integration:** Git clone / recent repos with path validation in the main process.
- **Type-Safe IPC:** Surface guarded with Zod schemas in `@linux-dev-home/shared`.

## 🛠️ Prerequisites

- **Node.js 20+**
- **pnpm** 9 (`corepack enable` recommended)
- **Docker** (optional, for compose stacks and the Docker panel)
- **Build toolchain:** `build-essential`, `python3` (required for native `node-pty` module)

## 🚀 Getting Started

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Rebuild native modules:**
   After install, rebuild native modules for your Electron version:
   ```bash
   cd apps/desktop && pnpm exec electron-rebuild -f -w node-pty
   ```

3. **Development scripts:**
   ```bash
   pnpm dev          # Run electron-vite dev server
   pnpm test         # Run shared package unit tests (Zod)
   pnpm typecheck    # Run TypeScript validation
   pnpm lint         # Run ESLint
   pnpm build        # Build production bundle + copy compose profiles
   ```

## 🐳 Docker CI Image

```bash
docker build -f docker/Dockerfile .
```
The image runs tests, typecheck, lint, and production build inside Node 20.

## 📦 Flatpak & Docker socket

See [docs/DOCKER_FLATPAK.md](docs/DOCKER_FLATPAK.md), [docs/INSTALL_TEST.md](docs/INSTALL_TEST.md), and [docs/FLATHUB_CHECKLIST.md](docs/FLATHUB_CHECKLIST.md).

## 🌳 Monorepo Layout

- `apps/desktop` — Electron + React UI
- `packages/shared` — Shared types, IPC channel names, Zod schemas
- `docker/compose/*` — Bundled `docker compose` profiles
- `flatpak/` — Flatpak manifest template + notes

## 📜 License

MIT — see [LICENSE](LICENSE).

---
*Built with ❤️ for the Linux Developer Community.*
