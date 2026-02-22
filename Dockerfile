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

RUN mkdir -p /config && chown -R node:node /config
VOLUME /config

USER node

CMD ["node", "dist/index.js"]
