# BravoForest API

NestJS REST API over the existing MariaDB schema. TypeORM schema synchronization is disabled; import `database/BravoForest.sql` before starting.

## Local run

1. Copy `.env.example` to `.env` and replace every secret.
2. Run `npm ci`, then `npm run start:dev`.
3. Run the worker separately with `npm run worker:dev`.

Swagger is served at `/api/docs`. Liveness and readiness are `/api/v1/health/live` and `/api/v1/health/ready`.

Machine requests require `x-machine-id`, `x-api-key`, a unique `x-request-nonce`, and epoch milliseconds in `x-request-timestamp`. Item scans also require `x-idempotency-key`.

Refresh tokens are HttpOnly, SameSite=Strict cookies. Redis stores a SHA-256 digest of each token at `refresh:<jti>` with `JWT_REFRESH_TTL_SECONDS`; refresh rotates and deletes the previous key, and logout deletes it.

## Set the initial admin password

The SQL seed intentionally does not provide a published login password. After importing the schema, set a unique password from PowerShell:

```powershell
$secure = Read-Host "New admin password" -AsSecureString
$env:ADMIN_BOOTSTRAP_PASSWORD = [System.Net.NetworkCredential]::new('', $secure).Password
try { npm run admin:set-password -w @bravoforest/api }
finally { Remove-Item Env:ADMIN_BOOTSTRAP_PASSWORD -ErrorAction SilentlyContinue }
```

The command updates the active admin identified by `ADMIN_BOOTSTRAP_EMAIL` (default `admin@bravoforest.local`) and never prints the password.
