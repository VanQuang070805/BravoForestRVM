# BravoForest security deployment notes

This document separates protections enforced by the repository from protections that depend on the production host or cloud account.

## Database and personal information

- Customer names, email addresses, and phone numbers remain readable database fields because the application must display them and search by email/phone. Do not bcrypt these fields: bcrypt is a one-way password hash and would break lookup and display. Customer passwords are stored as bcrypt hashes.
- The SQL seed no longer creates an admin with a published default password. Create the first admin with `npm run admin:set-password -w @bravoforest/api`; the command requires a strong password from the environment and does not print it. For existing databases, apply the credential-version migration, then `database/migrations/20261018_lock_legacy_admin_seed.sql`; this locks only the legacy admin row if its password hash is still the published default. Set the new password with the bootstrap command before sign-in.
- The production Compose stack does not publish MariaDB's port. The API and worker use the least-privilege application DB credentials; the root DB password is only provided to MariaDB during container bootstrap, not to API or worker processes.
- Compose isolates web frontends and Nginx from the private database/Redis network. Only API and worker services join that data network; API and worker use a separate outbound network for external integrations.
- The MariaDB Docker volume and backup destinations must be placed on encrypted host/block storage. Keep the storage encryption key outside the DB host and repository. Encrypt backups independently, restrict their access, and periodically verify restore procedures. This is an operator/cloud-storage setting and cannot be guaranteed by a Compose named volume.
- The production MariaDB init script reduces the application user's grants to SELECT/INSERT/UPDATE/DELETE. It runs automatically for a new data volume. For an existing volume, run `sh /docker-entrypoint-initdb.d/10-runtime-grants.sh` in the MariaDB container after updating Compose. Keep schema migrations as an explicit DBA task. Do not use the MariaDB root account in either application service.
- MariaDB does not provide PostgreSQL-style row-level security policies. Customer record ownership is enforced by API authentication and user-scoped queries. Keep new endpoints scoped to the authenticated user and use admin role checks for operational data.

## Credentials and sessions

- `infrastructure/.env.prod` supplies Compose interpolation values. The API and worker load separate runtime allowlists from `.env.api.prod` and `.env.worker.prod`, plus partner credentials from `.env.partners.prod`.
- Do not commit copied environment files. Use a production secret manager where available, rotate any values that were ever exposed, and use distinct access and refresh JWT secrets.
- Password reset and password change increment `credential_version`. The API checks that version for every access token and refresh, so old sessions stop working immediately. Existing databases need the one-time SQL migration documented in `apps/api/README.md`.
- Access tokens in the customer and admin web apps are held in page memory. The refresh token stays in a Secure, HttpOnly, SameSite cookie in production. A browser reload can renew the session through that cookie.
- Refresh calls are serialized across tabs with the Web Locks API where the browser supports it. Keep supported production browsers current; browsers without Web Locks can still race when multiple tabs refresh at the same time.
- The Google Maps browser key is necessarily visible to browsers. Restrict it by allowed website referrers and enabled APIs in Google Cloud. Keep the server geocoding key in the API-only environment file.

## Web edge and abuse controls

- The production Nginx configuration redirects HTTP to HTTPS, accepts TLS 1.2/1.3, sends HSTS, and adds `nosniff`, a strict referrer policy, and anti-framing headers.
- Provision and renew valid TLS certificates for all configured domains. Confirm DNS, firewall rules, and the deployed certificate before opening the service to users.
- The API uses Redis-backed request throttling and tighter limits on authentication/OTP routes. CAPTCHA/WAF rules are not configured in this repository; add a managed WAF or challenge flow if production abuse or traffic requirements justify it.
- Swagger API documentation is available only outside production.
- API request DTOs are validated, DB lookups use bound parameters, and React renders text as escaped content. Continue avoiding raw HTML insertion and dynamic SQL built from user-provided identifiers.

## Deployment checks outside this repository

### Safe deployment order

Do not start the full Compose stack in one command before applying database grants and migrations. For an existing deployment, first stop public ingress and application writers while keeping the database available:

```powershell
$compose = @('--env-file', 'infrastructure/.env.prod', '-f', 'infrastructure/docker-compose.prod.yml')
docker compose @compose stop nginx api worker
docker compose @compose up -d mariadb
```

For a new database, import `database/BravoForest.sql` using a DBA account. For an existing volume, apply schema migrations as a DBA, in order: `20261018_add_user_credential_version.sql`, then `20261018_lock_legacy_admin_seed.sql`. Apply the runtime grants after Compose has updated the MariaDB container:

```powershell
$compose = @('--env-file', 'infrastructure/.env.prod', '-f', 'infrastructure/docker-compose.prod.yml')
docker compose @compose exec -T mariadb sh /docker-entrypoint-initdb.d/10-runtime-grants.sh
```

The init script also runs automatically on a new MariaDB volume. It is safe to rerun on an existing volume. Once the schema and grants are ready, start only the API, bootstrap the initial admin or reset the legacy seeded admin, then start the remaining services and public ingress:

```powershell
docker compose @compose up -d --build api
# Follow the PowerShell bootstrap instructions in apps/api/README.md.
docker compose @compose up -d --build worker customer-web admin-web rvm-kiosk nginx
```

Starting `api` also starts its declared MariaDB and Redis dependencies. Keep Nginx stopped until the admin bootstrap succeeds and the live TLS certificates, DNS, and firewall rules are ready. For a fresh schema, the base SQL already includes `credential_version`, so the credential-version migration is only needed for databases created from an older schema.

Before public launch, verify host and backup encryption, secret-manager access, DB grants, TLS renewal, Google Maps key restrictions, alerting for failed logins/OTP abuse, and a tested backup restore. The repository cannot confirm those live account settings by inspecting source files. Add MFA for administrative accounts before exposing the dashboard if the deployment requires stronger protection against account takeover; this application currently does not implement admin MFA.
