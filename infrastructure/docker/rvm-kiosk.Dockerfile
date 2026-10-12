FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/rvm-kiosk/package.json apps/rvm-kiosk/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN npm ci
COPY apps/rvm-kiosk apps/rvm-kiosk
COPY packages/ui packages/ui
RUN npm run build -w @bravoforest/rvm-kiosk && npm prune --omit=dev

FROM node:24-alpine AS runtime
ENV NODE_ENV=production PORT=3002
WORKDIR /app
COPY --from=build /app ./
USER node
EXPOSE 3002
CMD ["npm", "run", "start", "-w", "@bravoforest/rvm-kiosk"]
