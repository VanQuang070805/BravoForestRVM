# BravoForest API

NestJS REST API over the existing MariaDB schema. TypeORM schema synchronization is disabled; import `database/BravoForest.sql` before starting.

## Local run

1. Copy `.env.example` to `.env` and replace every secret.
2. Run `npm ci`, then `npm run start:dev`.
3. Run the worker separately with `npm run worker:dev`.

Swagger is served at `/api/docs`. Liveness and readiness are `/api/v1/health/live` and `/api/v1/health/ready`.

Machine requests require `x-machine-id`, `x-api-key`, a unique `x-request-nonce`, and epoch milliseconds in `x-request-timestamp`. Item scans also require `x-idempotency-key`.

Refresh tokens are HttpOnly, SameSite=Strict cookies. Only their bcrypt hashes are stored in Redis at `refresh:<jti>` with `JWT_REFRESH_TTL_SECONDS`; refresh rotates and deletes the previous key, logout deletes it.
