# Desk Garden web app. Used by compose.dev.yaml (target "dev") and compose.prod.yaml (target "web").
# The macOS desktop app is not built here; build it on the Mac with `npm run desktop:build`.

ARG NODE_IMAGE=node:26.11.1-alpine
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.29-alpine

# ---- Dependencies, installed exactly as locked in package-lock.json ----
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# ---- Development: Vite dev server. The source is bind-mounted by compose.dev.yaml. ----
FROM deps AS dev
ENV NODE_ENV=development
EXPOSE 5174
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5174"]

# ---- Production build: only the files the web build needs ----
FROM deps AS build
COPY tsconfig.json vite.config.ts index.html .env.production ./
COPY public ./public
COPY src ./src
RUN npm run build:prod

# ---- Production web server: just the static bundle ----
FROM ${NGINX_IMAGE} AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf /etc/nginx/security-headers.conf
# Replace the base image's sample pages with the build, so only Desk Garden's files are served.
USER root
RUN rm -rf /usr/share/nginx/html/*
USER nginx
COPY --from=build /app/build/production /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
