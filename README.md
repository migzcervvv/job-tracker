# Job Tracker

Job application tracking with an ASP.NET Core 8 API, React client, PostgreSQL/pgvector, private resume storage, and n8n automation.

Applications have Saved, active, and distinct terminal states. The tracker supports editing, search and sorting, follow-ups, snooze, employer-response tracking, contacts, notes, deadline alerts, explicit resume selection, CSV/JSON portability, browser capture, and funnel metrics. Bulk archive supports undo.

Automation uses a persistent database outbox. A successful webhook response means dispatched; only a correlated authenticated callback completes a run. Retries receive new run IDs. Interview generation targets a saved round. Resume extraction produces a reviewable proposal and never selects the active resume automatically.

## Development

Prerequisites: .NET SDK specified by `global.json`, Node.js 24, and Docker with Linux containers for database/integration checks.

1. Copy `.env.example` to `.env` and replace its local placeholder secrets.
2. Run `docker compose up --build -d`. It starts local PostgreSQL/pgvector, applies migrations, starts the API at `http://localhost:8080`, and runs a deterministic automation fixture.
3. In `client`, run `npm ci`. Create ignored `client/.env.local` containing `VITE_API_URL=http://localhost:8080`, then run `npm run dev`.
4. Sign in with the administrator credentials configured in the local environment. Create ordinary users from administration.

The fixture does not call an LLM or parse documents. Real uploads require a private Supabase `resumes` bucket and server-only `Supabase:Url`/`Supabase:ServiceRoleKey` configuration. Optional demo credentials create a test-role account; its application data and uploads are ephemeral per-session, and automation is simulated. Demo sessions cannot change persistent Identity credentials.

For real automation, use the inactive workflow templates and setup instructions in [n8n/README.md](n8n/README.md). Starting the optional n8n profile does not switch the API away from the fixture automatically.

## Verification

Run the local API, frontend, migration, contract, build, audit, and formatting checks:

```powershell
./scripts/verify.ps1
```

The PostgreSQL test is skipped unless an isolated loopback database named `jobtracker_test` is provided:

```powershell
$env:JOBTRACKER_TEST_DATABASE = 'Host=localhost;Database=jobtracker_test;Username=jobtracker;Password=YOUR_LOCAL_PASSWORD'
./scripts/verify.ps1 -RequirePostgres
```

CI runs the PostgreSQL integration test and rejects skipped tests. It also builds API/migration/parser containers, tests PDF/DOCX parsing, verifies a database restore containing vectors, validates Compose and Terraform, and scans the checkout for secrets. Local parser checks require `pip install -r parser/requirements.txt` followed by `python -m unittest discover -s parser -v`.

[REPAIR_STATUS.md](REPAIR_STATUS.md) maps the review findings to repairs and records verification limits. [docs/operations.md](docs/operations.md) describes deployment, rollback, configuration, and recovery. [PROJECT_REVIEW.md](PROJECT_REVIEW.md) is the original review, with historical findings and line numbers.

## Fit score

Skill coverage is the sum of matched importance weights divided by all requirement weights. Importance ranges from 1 to 3. When compatible 1536-dimensional resume and requirement embeddings exist, the score blends 70% weighted coverage and 30% semantic similarity, with cosine rescaled from 0.3–0.9 and clamped. Otherwise it uses coverage alone.

Cosine divides by both vector magnitudes. Proficiency ratings are personal notes and do not change coverage or fit. Scores are heuristics, not hiring probabilities. Detail and board use the same scoring service and show missing/matched requirements.

## Security and data

JWT validation checks current account existence, security stamp, lockout, and roles. Tenant filters fail closed. Internal endpoints require `X-Automation-Key`; browser credentials cannot invoke them. Automation credentials, storage keys, database passwords, and provider keys stay outside tracked configuration.

Previously committed credentials require external rotation and Git-history remediation. Removing them from the current checkout does not revoke them. Current secret scanning does not certify old history as clean.

Application JSON backups include core fields, requirement importance, stage data, generated questions, manual notes, and follow-ups. They do not contain resume binaries, embeddings, account credentials, or an audit-history replay. CSV is a subset and prefixes spreadsheet-formula cells with an apostrophe. Account deletion revokes sessions and removes owned database records, while durable cleanup retries storage removal.
