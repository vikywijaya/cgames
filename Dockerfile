# Merged Fly.io deployment: builds the cgames SPA (served under /games) and
# ships it inside the caritahub-games multiplayer server (server/), which
# serves both the multiplayer platform (root) and the cgames build (/games).

FROM node:20-alpine AS web-build
WORKDIR /web
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY src/shared/gameData.js /src/shared/gameData.js
COPY --from=web-build /web/dist /dist

EXPOSE 3000
CMD ["node", "server.js"]
