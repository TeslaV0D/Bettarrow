# ---------------------------------------------------------------------------
# Bettarrow production image
#   - Next.js standalone server (no node_modules on the host, no host Node.js)
#   - bundled migration job (/app/migrate.mjs) used by the `migrate` service
#   - runs as unprivileged user `app` (UID 1001), tini as init
# Build:  docker build -t bettarrow-web:local .
#         (CI: .github/workflows/ci.yml builds, tests and publishes it to ghcr.io)
# ---------------------------------------------------------------------------
ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm run build:migrate

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    BACKUP_DIR=/backups \
    MIGRATIONS_DIR=/app/drizzle
RUN apk add --no-cache tini su-exec \
 && addgroup -S app -g 1001 && adduser -S app -u 1001 -G app \
 && mkdir -p /backups && chown app:app /backups
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/drizzle ./drizzle
COPY --from=build --chown=app:app /app/dist/migrate.mjs ./migrate.mjs
COPY --from=build --chown=app:app /app/scripts/hash-password.mjs ./scripts/hash-password.mjs
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# Build info (kept last so that a new revision does not invalidate the cached layers above),
# shown by GET /api/health. The source label links the GHCR package to the repository.
ARG APP_VERSION=dev
ARG APP_REVISION=unknown
ARG APP_SOURCE=https://github.com/TeslaV0D/Bettarrow
LABEL org.opencontainers.image.title="Bettarrow" \
      org.opencontainers.image.description="Self-hosted gym training tracker" \
      org.opencontainers.image.licenses="UNLICENSED" \
      org.opencontainers.image.source="${APP_SOURCE}" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${APP_REVISION}"
ENV APP_VERSION=${APP_VERSION} \
    APP_REVISION=${APP_REVISION}
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--", "docker-entrypoint.sh"]
CMD ["node", "server.js"]
