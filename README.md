# Job Tracker

ASP.NET Core 8 backend developed in Visual Studio 2022 and published to MonsterASP. React frontend developed in VS Code and published to Netlify. PostgreSQL/pgvector stores application data; existing n8n workflows provide automation.

## Run locally

1. Open `JobTracker.Api/JobTracker.Api.sln` in Visual Studio 2022. Use the .NET SDK selected by `global.json` (8.0.425 or a later 8.0.4xx patch).
2. Right-click the API project and choose **Manage User Secrets**. Keep private backend settings there: `ConnectionStrings:Default`, `Jwt:Key`, `Automation:ApiKey`, n8n URLs, and Supabase settings. Retain your existing configured values. [Configuration details](docs/operations.md).
3. Apply outstanding migrations to your development database before starting the updated API. In Visual Studio's Package Manager Console, select JobTracker.Api and run `Update-Database -Context AppDbContext`.
4. Select the **https** launch profile and start debugging. The API opens at `https://localhost:7179`; Swagger is at `/swagger`. The existing HTTP and IIS Express profiles are also preserved.
5. Open `client` in VS Code. If it has no local environment file, copy `client/.env.example` to `client/.env.local`. Set `VITE_API_URL` to the API origin for the selected Visual Studio profile.
6. In the client terminal, run `npm ci`, then `npm run dev`. The configured local frontend origin is `http://localhost:5173`.

There is no root environment file. Backend settings use normal ASP.NET configuration; frontend settings stay in `client`. The API's development settings include the frontend CORS origin. A trusted ASP.NET HTTPS development certificate is required when using the HTTPS profile.

Resume uploads use your private Supabase `resumes` bucket with server-only `Supabase:Url` and `Supabase:ServiceRoleKey`. n8n receives authenticated triggers and completes them through correlated callbacks. The versioned templates and contracts are documented in [n8n/README.md](n8n/README.md). The secure PDF/Word parser remains under `parser` for workflows that use it; it is not part of the Visual Studio or Netlify startup.

## Tests

Backend tests run through Visual Studio Test Explorer. Frontend tests run using `npm test` inside `client`.

From the project root, run the combined verification script:

```powershell
./scripts/verify.ps1
```

This checks backend/frontend tests, builds, formatting, lint, migration consistency, dependency auditing, and automation contracts. Most tests use local fixtures and in-memory databases. The PostgreSQL integration test requires a separate local PostgreSQL installation with pgvector and a disposable database named `jobtracker_test`:

```powershell
$env:JOBTRACKER_TEST_DATABASE = 'Host=localhost;Database=jobtracker_test;Username=YOUR_TEST_USER;Password=YOUR_TEST_PASSWORD'
./scripts/verify.ps1 -RequirePostgres
```

The database test refuses remote hosts and production database names. CI installs PostgreSQL and pgvector directly on its runner, runs this test, rejects skips, and verifies backup restoration with vector data. A separate Python job checks the retained document parser. Secret scanning, frontend checks, and backend publishing also run in CI.

## Deployment

Netlify builds the `client` project with `npm run build` and publishes `client/dist` (or `dist` when the configured base directory is `client`). Production requests use `/api` on the Netlify hostname; `client/public/_redirects` proxies them to MonsterASP before the frontend fallback. `VITE_API_URL` configures local development; it does not override production routing. Private API credentials stay on the backend.

The API retains its MonsterASP WebDeploy publish profile. Visual Studio Publish remains available. GitHub deployment also verifies the revision, applies migrations, publishes, and checks readiness. Pushes to `main` trigger that workflow. Runtime backend settings remain on MonsterASP. [Operations and recovery](docs/operations.md).

## Application behavior

Applications support Saved and active states, distinct outcomes, editing, search/sort/filter, contacts, notes, follow-ups, snooze, deadline alerts, bulk archive/undo, per-application resume selection, import/export, capture, and funnel metrics.

Automation has a persistent database outbox, bounded retries and deadlines. Webhook acknowledgement means dispatched; only a successful callback completes the run. Interview generation targets a saved round. Resume extraction produces a reviewable proposal and never automatically selects the active resume.

Fit uses weighted skill coverage (importance 1–3). With compatible 1536-dimensional embeddings, it blends 70% coverage and 30% cosine similarity rescaled from 0.3–0.9. Otherwise it uses coverage alone. Proficiency ratings are personal notes. Scores are heuristics, not hiring probabilities.

JWT validation checks current account existence, security stamp, lockout, and roles. Tenant filters fail closed; internal callbacks require `X-Automation-Key`. Existing exposed credentials still need external rotation and history cleanup.

[REPAIR_STATUS.md](REPAIR_STATUS.md) maps repairs and tests to the original [PROJECT_REVIEW.md](PROJECT_REVIEW.md). JSON exports preserve application fields, requirements, stages and manual notes; resume binaries and embeddings are not included. Account deletion revokes sessions, removes owned database records and queues external storage cleanup.
