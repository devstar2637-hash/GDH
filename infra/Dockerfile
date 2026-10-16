# infra/Dockerfile — single Cloud Run service: web (static) + api. Node 20 LTS.
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
COPY shared ./shared
COPY data ./data
COPY engine ./engine
COPY loop ./loop
COPY web ./web
RUN npm ci && npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /app /app
RUN mkdir -p /app/runs && chown -R node:node /app
USER node
EXPOSE 8080
CMD ["npm", "run", "start"]
