FROM node:20-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential python3 pkg-config \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.14.2 --activate

WORKDIR /workspace

COPY . .

RUN pnpm install \
  && cd apps/desktop && pnpm exec electron-rebuild -f -w node-pty

ENV CI=1

CMD ["bash", "-c", "pnpm test && pnpm typecheck && pnpm lint && pnpm build"]
