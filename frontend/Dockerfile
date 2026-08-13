# Build context is the repo root (see docker-compose.yml).
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend ./frontend

RUN npm ci
RUN npm run build

# Serve the production build with nginx and proxy /api + /images to the backend.
FROM nginx:alpine

COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
