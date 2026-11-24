# Build context MUST be the repository root (the npm workspace root).
# Railway: leave "Root Directory" as "/" and let it detect this Dockerfile.
FROM node:22-alpine AS deps
WORKDIR /app

# Install workspace dependencies from the root lockfile.
COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./package.json
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/backend/src ./apps/backend/src
COPY apps/backend/migrations ./apps/backend/migrations
COPY scripts/start-backend.mjs ./scripts/start-backend.mjs

EXPOSE 8080
USER node

# Validates required environment variables, then starts the API on 0.0.0.0:$PORT.
CMD ["node", "scripts/start-backend.mjs"]
