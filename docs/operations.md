# Operations

## Existing development and hosting

The frontend runs from VS Code with Vite and deploys to Netlify. The backend runs from Visual Studio 2022 and deploys to MonsterASP using the existing WebDeploy profile. Existing HTTP, HTTPS and IIS Express launch profiles are preserved.

Frontend configuration is `client/.env.local` during development and Netlify build environment variables in production. `VITE_API_URL` is the API origin, without a trailing `/api`. The default HTTPS backend profile uses `https://localhost:7179`; HTTP uses `http://localhost:5233`. IIS Express uses its existing launch-settings ports. Frontend environment changes require a Vite restart or a new Netlify build.

Local private backend settings belong in Visual Studio **Manage User Secrets**. ASP.NET loads appsettings, development user secrets and environment variables. The design-time EF factory reads matching configuration too, so Package Manager Console migrations can use the same development connection.

## Backend configuration

| JSON setting | Purpose |
| --- | --- |
| ConnectionStrings:Default | Your PostgreSQL database connection; require TLS for remote hosting |
| Jwt:Key / Jwt:Issuer / Jwt:ExpiryMinutes | Signing secret, issuer, access lifetime (default 60 minutes) |
| Automation:ApiKey | Shared API/n8n authentication key; server-only |
| Automation:WorkerEnabled | Enables durable dispatch; default true |
| N8n:BaseUrl | Your running n8n instance's base URL |
| N8n:SkillExtractionWebhookUrl | Active skills workflow production URL |
| N8n:InterviewQuestionsWebhookUrl | Active question workflow production URL |
| N8n:ResumeExtractionWebhookUrl | Active resume workflow production URL |
| Supabase:Url / Supabase:ServiceRoleKey | Private resume storage |
| Cors:Origins | Exact allowed frontend origins, including your Netlify origin in production |
| Bootstrap:AdminEmail / Bootstrap:AdminPassword | Initial new administrator only |
| TestAccount:Email / TestAccount:Password | Existing demo account, when enabled |

Environment variables express nested keys with double underscores, for example `ConnectionStrings__Default`. Keep production secrets in MonsterASP's private ASP.NET configuration, never in Netlify frontend variables or tracked files. Current checked-in settings contain no private values.

The local frontend CORS origin is `http://localhost:5173`. Configure the actual hosting proxy before relying on forwarded client IPs for throttling. Preserve HTTPS and trusted certificates.

## Verification

`scripts/verify.ps1` runs the normal API/client/automation checks. `-RequirePostgres` requires `JOBTRACKER_TEST_DATABASE`; it must identify a disposable loopback PostgreSQL database named `jobtracker_test`, with pgvector installed or available to create.

The database test creates a random schema with explicitly scoped migration history, applies migrations, checks vector persistence, optimistic concurrency, global skill upserts and cascades, then removes that schema. It must not use hosted user data. CI installs PostgreSQL and pgvector directly and rejects skipped tests.

The parser tests remain in a separate CI Python job. Local Python checks are `python -m pip install -r parser/requirements.txt` and `python -m unittest discover -s parser -v`. Ordinary API/frontend startup does not require Python. The automation fixture is a test helper, not an application service to start.

## Deployment and migrations

Visual Studio's existing MonsterASP publish profile remains available. GitHub's backend deployment uses the tested revision, serializes production releases, applies migrations, publishes through WebDeploy, and runs smoke checks.

Its production environment requires secrets `PRODUCTION_DATABASE`, `MONSTERASP_USERNAME`, `MONSTERASP_PASSWORD`, and variable `API_BASE_URL`. Runtime ASP.NET settings must also be configured on MonsterASP. WebDeploy requires a trusted certificate.

Before releasing the repaired API, back up PostgreSQL and private resume storage, review the generated `artifacts/migrations.sql`, and apply pending migrations. In Visual Studio Package Manager Console, use `Update-Database -Context AppDbContext` against the intended configured development database. Production migration is handled by deployment or the equivalent explicitly targeted EF command.

The migrations add automation/notification/concurrency fields, recover stranded legacy extraction states, and scrub legacy automation message bodies. Those bodies cannot be recovered by rolling code back.

Netlify deployment remains separate: build command `npm run build`, output `dist` relative to `client`, public `VITE_API_URL` pointing to MonsterASP. Existing Netlify site settings are not modified by repository cleanup.

## Recovery and external tasks

Use your database provider's backup/PITR facilities and separately back up the private resume bucket. CI verifies native pg_dump/pg_restore with vector values using a separate disposable database. Keep n8n's database and encryption key backed up together.

A code rollback keeps additive schema changes unless a separately reviewed restore is required. Old code may not support the new callback semantics; pause external workflows while validating compatibility. Do not use destructive Down migrations as routine rollback.

Previously exposed credentials require rotation through their providers, followed by coordinated history cleanup. Existing orphaned storage objects require reconciliation against persisted Resume.StoragePath values before deletion. These external actions have not been performed.

## Monitoring

`/api/health/live` is process liveness. `/api/health/ready` checks the database and pending migrations. `/api/health/n8n` reports workflow health. Workflow outages display a nonblocking banner.

Admin automation monitoring exposes current run state, attempts, elapsed time, failures and retries. Pending dispatch and storage cleanup must be processed by the hosted worker. If the hosting plan suspends idle applications, automated work pauses until the process runs again; host availability is separate from durable storage of pending work.

Logs omit raw resume text, signed URLs and credentials. Obsolete terminal runs become eligible for deletion after 30 days; current resource run records are retained. Notifications require opt-in, delivery leases and provider idempotency. Default workflow schedules use UTC, while date-only deadlines use the user's time zone.

Account deletion removes owned records and revokes sessions; file deletion retries asynchronously. Backups and historical provider logs retain their own retention policies.
