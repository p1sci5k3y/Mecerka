# ── Stage 1: Build (includes devDependencies for TypeScript compilation) ─────
FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl python3 make g++

COPY package*.json ./
COPY prisma ./prisma/

# Install ALL deps (including dev) needed for tsc + prisma generate
RUN npm ci
RUN npx prisma generate

COPY . .
RUN npx tsc -p tsconfig.build.json

# ── Stage 2: Production deps (lean — no devDependencies) ─────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

RUN apk add --no-cache openssl python3 make g++

COPY package*.json ./
COPY prisma ./prisma/

# Only production dependencies + regenerate Prisma client for target platform
RUN npm ci --omit=dev
RUN npx prisma generate

# ── Stage 3: Final runner image (smallest possible footprint) ─────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Only openssl needed at runtime for Prisma
RUN apk add --no-cache openssl

# Create a non-root user for security
RUN addgroup --system --gid 1001 nestjs \
    && adduser --system --uid 1001 nestjs

COPY --from=deps    --chown=nestjs:nestjs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nestjs /app/dist        ./dist
COPY --from=deps    --chown=nestjs:nestjs /app/prisma      ./prisma
COPY --chown=nestjs:nestjs package*.json ./

USER nestjs

EXPOSE 3000

CMD ["node", "dist/src/main"]
