# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc tsconfig.base.json branding.json ./
COPY packages ./packages
COPY apps/web ./apps/web
COPY apps/cli ./apps/cli
COPY apps/desktop ./apps/desktop
ARG NEOTOOLS_BRANDING=/src/branding.json
ENV NEOTOOLS_BRANDING=${NEOTOOLS_BRANDING}
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @neotools/engine --filter @neotools/tools-pdf --filter @neotools/web build

FROM nginx:1.27-alpine
RUN apk add --no-cache nginx-mod-http-brotli || true
COPY deploy/docker/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /src/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
