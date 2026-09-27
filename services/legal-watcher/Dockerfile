# ============================================================================
# Adminiculum legal watcher service — W1 on-demand dry-run CLI.
# Zero runtime npm dependencies (Node builtins only). No server, no health
# endpoint: the image runs the watcher once and exits.
# Pinned base (node major.minor + alpine minor); never :latest.
# ============================================================================

FROM node:20-alpine3.20 AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine3.20 AS runtime
WORKDIR /app
COPY --from=build /build/dist ./dist
RUN chown -R node:node /app
USER node
ENTRYPOINT ["node", "dist/index.js"]
