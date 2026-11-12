# Standalone image (no workspace dependencies):
#   docker build -t nx-metrics-collector packages/nx-metrics-collector
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json tsconfig.json tsconfig.lib.json ./
RUN npm install --no-audit --no-fund
COPY scripts ./scripts
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:${PORT}/health || exit 1
CMD ["node", "dist/main.js"]
