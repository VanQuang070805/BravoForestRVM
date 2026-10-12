
FROM node:22-alpine AS deps
WORKDIR /app
COPY apps/api/package*.json ./
RUN npm ci
FROM deps AS build
COPY apps/api/ ./
RUN npm run build && npm prune --omit=dev
FROM node:22-alpine AS production
ENV NODE_ENV=production
USER node
WORKDIR /app
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node apps/api/package.json ./package.json
EXPOSE 4000
CMD ["node","dist/main.js"]
