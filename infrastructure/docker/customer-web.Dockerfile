FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/customer-web/package.json apps/customer-web/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN npm ci
COPY apps/customer-web apps/customer-web
COPY packages/ui packages/ui
RUN npm run build -w @bravoforest/customer-web && npm prune --omit=dev

FROM node:24-alpine AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build /app ./
USER node
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "@bravoforest/customer-web"]
