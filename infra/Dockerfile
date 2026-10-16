# infra/Dockerfile — single Cloud Run service: web (static) + api. Node 20 LTS.
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
COPY shared ./shared
COPY engine ./engine
COPY loop ./loop
COPY web ./web
RUN npm ci --ignore-scripts && npm run build
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /app /app
USER node
EXPOSE 8080
CMD ["npm","run","start"]
