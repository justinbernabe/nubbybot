FROM node:22-alpine AS frontend-builder

WORKDIR /app/admin-ui
COPY admin-ui/package.json admin-ui/package-lock.json* ./
RUN npm ci
COPY admin-ui/ ./
RUN npm run build

FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

FROM node:22-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && apk del python3 make g++

COPY --from=builder /app/dist ./dist
COPY --from=frontend-builder /app/admin-ui/dist ./admin-ui/dist

RUN mkdir -p /config && chown -R node:node /config
VOLUME /config

EXPOSE 7774

USER node

CMD ["node", "dist/index.js"]
