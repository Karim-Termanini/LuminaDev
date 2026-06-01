# ── Stage 1: dependencies ───────────────────────────────────────────────
FROM node:20-bookworm AS deps

RUN corepack enable && corepack prepare pnpm@9.14.2 --activate

WORKDIR /workspace

# Install only production deps first for better layer caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/desktop/package.json apps/desktop/

RUN pnpm install --frozen-lockfile

# ── Stage 2: build ──────────────────────────────────────────────────────
FROM deps AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential python3 pkg-config \
  && rm -rf /var/lib/apt/lists/*

COPY . .

ENV CI=1

RUN pnpm build

# ── Stage 3: test (optional; skip with --target test for CI) ────────────
FROM build AS test

CMD ["bash", "-c", "pnpm test && pnpm typecheck && pnpm lint"]

# ── Stage 4: production runtime (slim) ──────────────────────────────────
FROM node:20-bookworm-slim AS runtime

RUN corepack enable && corepack prepare pnpm@9.14.2 --activate

WORKDIR /workspace

COPY --from=build /workspace/apps/desktop/dist ./apps/desktop/dist
COPY --from=build /workspace/packages/shared/dist ./packages/shared/dist
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Default: verify the build is consumable
CMD ["bash", "-c", "echo 'Build artifacts ready' && ls -la apps/desktop/dist packages/shared/dist"]
