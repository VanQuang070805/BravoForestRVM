# BravoForest API

NestJS REST API over the existing MariaDB schema. TypeORM schema synchronization is disabled; import `database/BravoForest.sql` before starting.

## Local run

1. Copy `.env.example` to `.env` and replace every secret.
2. Run `npm ci`, then `npm run start:dev`.
3. Run the worker separately with `npm run worker:dev`.

Swagger is served at `/api/docs`. Liveness and readiness are `/api/v1/health/live` and `/api/v1/health/ready`.

Machine requests require `x-machine-id`, `x-api-key`, a unique `x-request-nonce`, and epoch milliseconds in `x-request-timestamp`. Item scans also require `x-idempotency-key`.

## RVM login and deposit protocol

1. The kiosk controller creates a session with `POST /api/v1/machine/sessions` and `{ "mode": "MEMBER" }` or `{ "mode": "GUEST" }`. Keep the returned `statusToken` on the device. For member sessions, display `qrToken` as the QR code; the customer app submits it to the authenticated `POST /api/v1/sessions/claim` endpoint. Guest sessions do not return a claimable QR token.
2. Poll `GET /api/v1/machine/sessions/{sessionId}/status` with `x-session-token: <statusToken>`. The token is hashed before it is stored. Status responses include database-backed accepted-item counts, points, and recent items.
3. The trusted RVM controller reads `GET /api/v1/machine/sessions/active` to discover the current `DEPOSITING` or `PROCESSING` session, then records accepted and rejected items with `POST /api/v1/machine/sessions/{sessionId}/items` and a database-unique idempotency key. The kiosk reports real user activity; each item also refreshes the activity lease. If there is no activity for five minutes, the API asks the Pi to stop accepting new items. The controller finishes any item already in the hardware path, drains its durable local outbox, and only then calls `/confirm` and `/finalize`. Finalization writes the wallet ledger entry and marks the session complete in one database transaction. A linked wallet is credited once; guest sessions receive no wallet points.

If kiosk browser state is lost, it can recover the current `DEPOSITING` or `PROCESSING` session and its database-backed status through the machine-authenticated active-status endpoint. An active deposit is not cancelled automatically, because the Pi may still have a confirmed item in its offline outbox. A QR session can only be cancelled before a customer claims it; expired, unclaimed QR sessions are closed when the next session is created.

The web kiosk intentionally does not expose machine-authenticated item, confirmation, or finalization calls to browser code. It only requests the end of a session through its server-side proxy; the authenticated Pi controller drains sensor-confirmed events and completes the database state machine.

For an existing database, apply `database/migrations/20261021_harden_rvm_session_finalization.sql` and then `database/migrations/20261021_session_idle_watchdog_and_sensor_rejections.sql` once before deploying this version. The first adds the finish-request timestamp and database-enforced per-session item idempotency. The second adds the five-minute activity lease and the database rejection reason used for sensor-rejected items. The first migration carries forward idempotency values written in older rows' `sensor_data` JSON.

Refresh tokens are HttpOnly, SameSite=Strict cookies. Redis stores a SHA-256 digest of each token at `refresh:<jti>` with `JWT_REFRESH_TTL_SECONDS`; refresh rotates and deletes the previous key, and logout deletes it. Password reset and password change increment the user's `credential_version`, invalidating old access and refresh tokens across devices.

Customer registration and password recovery send six-digit email codes using `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM`, and optionally `SMTP_USER`/`SMTP_PASSWORD`. Codes expire after ten minutes and are kept in Redis.

The base schema includes `credential_version`. For an existing database created from an older schema, apply `database/migrations/20261018_add_user_credential_version.sql` once before deploying this API version. Then apply `database/migrations/20261018_lock_legacy_admin_seed.sql` to lock the old seeded account only when its password still matches the published default. Bootstrap a new password before signing in.

## Set the initial admin password

The SQL seed does not create a default admin account. Run this after importing the schema to create the initial admin or replace the password of an existing, non-deleted admin account. Use a unique password and a deliverable email in production:

```powershell
$secure = Read-Host "New admin password" -AsSecureString
$env:ADMIN_BOOTSTRAP_PASSWORD = [System.Net.NetworkCredential]::new('', $secure).Password
try { npm run admin:set-password -w @bravoforest/api }
finally { Remove-Item Env:ADMIN_BOOTSTRAP_PASSWORD -ErrorAction SilentlyContinue }
```

The command creates or updates the admin identified by `ADMIN_BOOTSTRAP_EMAIL` (default `admin@bravoforest.local` for local development). In production, `.local` addresses are rejected. The command never prints the password, reactivates a locked admin, and increments `credential_version` when updating an existing account.

For the production Compose deployment, set the password and email in the PowerShell session, then execute the already compiled one-time bootstrap inside the API container:

```powershell
$secure = Read-Host "New admin password" -AsSecureString
$env:ADMIN_BOOTSTRAP_PASSWORD = [System.Net.NetworkCredential]::new('', $secure).Password
$env:ADMIN_BOOTSTRAP_EMAIL = Read-Host "Admin email"
try {
  docker compose --env-file infrastructure/.env.prod -f infrastructure/docker-compose.prod.yml exec -T -e ADMIN_BOOTSTRAP_PASSWORD -e ADMIN_BOOTSTRAP_EMAIL api node dist/scripts/set-admin-password.js
}
finally {
  Remove-Item Env:ADMIN_BOOTSTRAP_PASSWORD, Env:ADMIN_BOOTSTRAP_EMAIL -ErrorAction SilentlyContinue
}
```
