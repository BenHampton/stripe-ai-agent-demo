# build - compile TypeScript to dist/ using the full toolchain
FROM node:22-alpine AS build
RUN npm install -g pnpm@10
WORKDIR /app

# Copy manifests first so the install layer is cached across rebuilds when
# dependencies haven't changed (source edits won't bust this layer).
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json  packages/shared/
COPY packages/backend/package.json packages/backend/
# ALL deps (incl. dev) — tsc needs them
RUN pnpm install --frozen-lockfile

# Copy source and build. shared must build before backend (backend imports its compiled dist/).
COPY packages/shared/  packages/shared/
COPY packages/backend/ packages/backend/
RUN pnpm --filter @sai/shared build
RUN pnpm --filter @sai/backend build

# deps - install only production node_modules for the runtime
# Separate stage so devDependencies (typescript, vitest, eslint) never reach the final image
FROM node:22-alpine AS deps
RUN npm install -g pnpm@10
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json  packages/shared/
COPY packages/backend/package.json packages/backend/
RUN pnpm install --frozen-lockfile --prod   # --prod = runtime deps only

# runner - the lean image that actually ships
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# prod node_modules (from deps) + compiled output (from build)
COPY --from=deps  /app/node_modules           ./node_modules
COPY --from=build /app/packages/shared/dist   ./packages/shared/dist
COPY --from=build /app/packages/backend/dist  ./packages/backend/dist
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json  packages/shared/
COPY packages/backend/package.json packages/backend/

EXPOSE 3000

CMD ["node", "packages/backend/dist/index.js"]