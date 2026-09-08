FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS build
COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:24-alpine AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
WORKDIR /app
COPY package.json ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY server ./server
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "server/healthcheck.js"]
CMD ["node", "server/index.js"]
