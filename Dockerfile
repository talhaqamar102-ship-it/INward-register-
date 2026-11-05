# Multi-stage Dockerfile for Meridian Works MES & QA Portal
# Requires Node 22+ for native node:sqlite DatabaseSync support

# Stage 1: Build the frontend bundle
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies exactly from the committed lockfile for reproducible builds
COPY package*.json ./
RUN npm ci

# Copy source code and build Vite frontend assets
COPY . .
RUN npm run build

# Prune development dependencies to keep final image slim
RUN npm prune --omit=dev

# Stage 2: Production Runtime
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy pruned production dependencies from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Copy compiled frontend distribution
COPY --from=builder /app/dist ./dist

# Copy backend server, schemas, services, and assets
COPY server.ts ./
COPY tsconfig.json ./
COPY src/ ./src/
COPY vanilla/ ./vanilla/
COPY public/ ./public/

# Create persistent directory for SQLite database & backups
RUN mkdir -p /app/data

# Persistent volume target for SQLite DB (gloves_packing.db)
VOLUME ["/app/data"]

# Expose MES service port
EXPOSE 3000

# Docker native health check using built-in Node 22 fetch
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Start the full-stack server
CMD ["npm", "start"]
