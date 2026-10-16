FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.json ./
COPY shared ./shared
COPY engine ./engine
COPY loop ./loop
COPY data/onsiteLoader.ts data/seoulLoader.ts ./data/
COPY web ./web
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/runs && chown node:node /app/runs
USER node
EXPOSE 8080
CMD ["node", "dist/web/server.js"]
