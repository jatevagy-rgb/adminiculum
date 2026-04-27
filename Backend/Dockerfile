# ============================================================================
# ADMINICULUM BACKEND — DOCKERFILE (Canonical Core)
# Multi-stage: build → production image
# ============================================================================
# Build stage compiles TypeScript and Prisma client
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy source
COPY tsconfig.json ./
COPY prisma/ prisma/
COPY src/ src/

# Generate Prisma client (native binaries needed at build time)
RUN npx prisma generate

# Compile TypeScript
RUN npm run build

# ============================================================================
# Production stage — minimal runtime image
# ============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

# Security: run as non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Install production-only dependencies
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy compiled output and Prisma client from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma

# Copy templates (optional feature pack) if present
COPY templates/ ./templates/

# Set ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

# Environment defaults (overridable at container start)
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

# Start production server
CMD ["node", "dist/index.js"]
