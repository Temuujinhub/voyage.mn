# ── build the React client ──────────────────────────────────────────────
FROM node:22-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ── runtime image ────────────────────────────────────────────────────────
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=client-build /app/client/dist /app/client/dist
EXPOSE 4000
USER node
CMD ["node", "src/index.js"]
