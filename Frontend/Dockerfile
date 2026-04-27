# ============================================================================
# ADMINICULUM FRONTEND — DOCKERFILE (Canonical Core)
# Multi-stage: build → production image
# ============================================================================
# Build stage compiles Next.js
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy source
COPY . .

# Generate Prisma client if needed (none in frontend but kept as pattern)
# Generate Next.js build
RUN npm run build

# ============================================================================
# Production stage — minimal Node.js + serving image
# ============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

# Security: run as non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Install production-only dependencies
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy compiled Next.js output
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./

# Set ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

# Environment defaults (overridable at container start)
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Start Next.js production server
CMD ["npm", "start"]
