# ==================== BUILD STAGE ====================
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY . .

# Generate Prisma client
RUN pnpm db:generate

# Build TypeScript
RUN pnpm build

# Prune dev dependencies
RUN pnpm prune --prod

# ==================== PRODUCTION STAGE ====================
FROM node:20-alpine AS runner

# Security: run as non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 edith

WORKDIR /app

# Copy production dependencies
COPY --from=builder /app/node_modules ./node_modules

# Copy Prisma files
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# Create logs directory
RUN mkdir -p logs && chown edith:nodejs logs

# Switch to non-root user
USER edith

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health/live || exit 1

# Start application
CMD ["node", "dist/app.js"]
