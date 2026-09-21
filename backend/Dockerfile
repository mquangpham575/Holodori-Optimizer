# Build context is the repo root (see docker-compose.yml).
FROM node:20-alpine

# ffmpeg shrinks the 5-star card animations when they are mirrored (etl/card-media.ts).
# Optional: without it they are streamed from the CDN instead.
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Install all deps (devDeps include TypeScript for the build), then prune dev
# deps after compiling so the runtime image stays slim.
COPY package.json package-lock.json ./
RUN npm ci

# Backend TypeScript source + the bundled data snapshot it seeds from.
COPY backend ./backend

# Talent fallback images served by express.static (../frontend/public/images).
COPY frontend/public/images ./frontend/public/images

# Compile TypeScript -> backend/dist (server.js + worker.js).
RUN npm run build:backend

# Drop dev dependencies for the runtime image.
RUN npm prune --omit=dev

WORKDIR /app/backend

EXPOSE 5000

CMD ["node", "dist/server.js"]
