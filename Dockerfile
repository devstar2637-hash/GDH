FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY package.json ./
COPY LICENSE_NOTICE.txt README.md ./
COPY docs ./docs
COPY data/seoul/README.md data/seoul/manifest.json data/seoul/context_2026_sample.json ./data/seoul/
COPY src ./src
COPY public ./public

USER node

EXPOSE 8080

CMD ["node", "src/server.js"]
