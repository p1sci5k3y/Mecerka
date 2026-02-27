# Base stage
FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
RUN npx prisma generate

COPY . .

RUN npx tsc -p tsconfig.build.json

# Production stage
FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache openssl


COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/tsconfig.json ./

EXPOSE 3000

CMD ["node", "dist/src/main"]
