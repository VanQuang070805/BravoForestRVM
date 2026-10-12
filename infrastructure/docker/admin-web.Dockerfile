FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN npm ci
ARG NEXT_PUBLIC_API_URL=/api/v1
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
COPY apps/admin-web apps/admin-web
COPY packages/ui packages/ui
RUN npm run build -w @bravoforest/admin-web && npm prune --omit=dev

FROM node:24-alpine AS runtime
ENV NODE_ENV=production PORT=3001
WORKDIR /app
COPY --from=build /app ./
USER node
EXPOSE 3001
CMD ["npm", "run", "start", "-w", "@bravoforest/admin-web"]
