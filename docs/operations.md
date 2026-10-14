# Operations

## Configuration

ASP.NET environment variables use double underscores for nested keys:

| Setting | Purpose |
| --- | --- |
| ConnectionStrings__Default | PostgreSQL connection; require TLS for remote hosting |
| Jwt__Key / Jwt__Issuer / Jwt__ExpiryMinutes | Random signing secret, issuer, access lifetime (default 60 minutes; clamped 5–120) |
| Automation__ApiKey | Server-to-server shared key, never sent to the browser |
| Automation__WorkerEnabled | Pause external dispatch during maintenance; default true |
| N8n__BaseUrl | n8n readiness dependency |
| N8n__SkillExtractionWebhookUrl / ResumeExtractionWebhookUrl / InterviewQuestionsWebhookUrl | Authenticated production triggers |
| Supabase__Url / Supabase__ServiceRoleKey | Private resume storage; not public frontend configuration |
| Cors__Origins__0 | Exact frontend origin; additional numbered entries allowed |
| Bootstrap__AdminEmail / AdminPassword | Initial new administrator only; remove password after bootstrap |
| TestAccount__Email / Password | Optional test-role account; leave unset in deployments that do not need demos |

Configure proxy trust for the actual hosting proxy before relying on forwarded client IPs for login throttling. Default middleware trusts loopback proxies; do not trust arbitrary internet forwarding headers. Use HTTPS at the hosting ingress. The local container API accepts HTTP behind that boundary.

Local demo application stores expire after one hour and are bounded to 500 cached roots; demo files are bounded to 50 MB. Demo sessions are intentionally disposable. Database-backed Identity is separate and remains authoritative for authentication.

## Verification gates

`scripts/verify.ps1` runs the local API/frontend checks, migration consistency and SQL generation, and dispatch contract tests. `-RequirePostgres` fails when its environment variable is missing; the test itself refuses a remote host or any database name other than `jobtracker_test`.

CI runs additional container, parser, secret, Terraform, and backup/restore checks. A successful static Compose or Terraform validation is not evidence that a provider deployment works. Workflow-template tests are not evidence that n8n imported or executed the exports.

The PostgreSQL test applies all migrations inside a disposable random schema, checks vector round-trip and optimistic concurrency, races global normalized skill creation, verifies a populated cascade, and drops that schema. It installs pgvector in the local test database's public schema. CI rejects skipped tests and restores a custom-format dump into a separate test database.

## Release and rollback

The deployment workflow reuses all CI jobs, records the tested SHA, checks out that exact revision, serializes production deployments, applies migrations, publishes, and runs readiness/anonymous-access smoke checks.

Required production environment secrets: `PRODUCTION_DATABASE`, `MONSTERASP_USERNAME`, `MONSTERASP_PASSWORD`. Required variable: `API_BASE_URL`, a reachable HTTPS API origin. Configure runtime settings independently on the host. WebDeploy certificate validation is enabled; the existing hosting endpoint must present a trusted certificate.

Before the first repaired release:

1. Rotate the previously exposed database, storage service-role, automation, and any reused credentials through their owning services. Reconfigure API, workflows, and CI.
2. Preserve an encrypted database backup, private resume-bucket backup, and n8n database/encryption-key backup outside this checkout. Verify restore in an isolated environment.
3. Review the generated `artifacts/migrations.sql`. The three pending migrations include the existing NewEmail migration, notification receipts, resume concurrency, legacy extraction recovery, and scrubbing legacy automation message bodies. Scrubbing cannot be undone by restoring old code.
4. Apply migrations before enabling code that requires their columns/tables. Reconfigure and validate n8n templates against these versioned callbacks.
5. Run the production smoke gate and inspect automation failures, pending age, and storage cleanup.

To roll application code back, manually dispatch `deploy-api` with the chosen verified commit/tag. Keep additive schema changes unless a separately reviewed restore is required. Older code is not automatically safe with the new callback semantics: pause the automation worker and workflows while validating compatibility. Do not run destructive Down migrations as routine rollback. Restoring a database loses changes after its recovery point and requires coordinated storage recovery.

No production migration, deployment, Terraform apply, credential rotation, or history rewrite was performed during this repair.

## Recovery

Local restore rehearsal:

```powershell
./scripts/backup-restore.ps1 -Container jobtracker-local-postgres-1
```

Use the actual Compose PostgreSQL container name if the project name differs. The script dumps `jobtracker_test`, retains the dump under ignored `artifacts/backups`, restores into a generated separate database, compares application counts, then drops only that generated database. It does not restore over the source.

For production, use provider-supported PostgreSQL point-in-time recovery and separately backed-up storage objects. Keep n8n's encryption key with restricted encrypted backups; a database backup without the matching key cannot recover provider credentials. Establish an explicit recovery-point and recovery-time target and rehearse it.

Existing historical orphaned storage objects require reconciliation: compare private bucket keys to persisted Resume.StoragePath values, review unmatched objects, then remove them through the storage provider. New uploads persist compensating cleanup before external upload; deletion retries survive process restarts.

Previously committed secrets remain in old Git history. Rotate first, then coordinate a history rewrite and remote cleanup across clones/forks. Current-checkout secret scanning intentionally does not rewrite history or prove old values are revoked.

## Monitoring and retention

`GET /api/health/live` is process liveness. `GET /api/health/ready` returns 503 for an unavailable database or pending migrations. `GET /api/health/n8n` reports workflow dependency status. Automation outages display a banner without unmounting forms or disabling tracking.

Admin automation monitoring is bounded to current run records and exposes state, attempts, elapsed time, failures, and retries. Investigate queued/dispatching age, callback timeouts, retry exhaustion, and storage cleanup growth. Logs include request/run IDs and error types, excluding raw resume text, signed URLs, and credentials. Latest resource run records are retained; obsolete terminal runs become eligible for deletion after 30 days.

Reminder delivery is opt-in with a five-minute lease and provider idempotency. Default workflow schedules use UTC; user time zones control date-only deadlines. Disabling preferences blocks subsequent delivery claims.

Account deletion removes tenant records and revokes current sessions; external files are queued for cleanup. Monitor the durable storage-deletion queue until it drains. Backups and previously collected provider execution logs need their own retention policy; application deletion does not retroactively alter an encrypted backup or old n8n history.
