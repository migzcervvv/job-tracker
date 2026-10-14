# Review repair status — updated 14 October 2026

The original [PROJECT_REVIEW.md](PROJECT_REVIEW.md) remains a historical snapshot. Repository fixes and tests are implemented below. External credential rotation/history cleanup, deployed infrastructure, production data reconciliation, and live workflow execution remain outstanding.

## Findings

| Review | Repair | Regression evidence |
| --- | --- | --- |
| 1. Committed credentials | Tracked settings and tests sanitized; environment configuration, ignored local secrets, current-checkout Gitleaks gate. External rotation and history cleanup remain required. | Current source scan |
| 2. Anonymous requirements mutation | Controller-wide automation authentication; fallback JWT policy; tenant filters fail closed; obsolete route returns authenticated 410. | API authorization and tenant tests |
| 3. Cross-tenant skill merge | Explicit global scope, atomic merge, maximum importance/proficiency and stronger evidence preserved; counts include all tenants. | FeatureRegressionTests global merge |
| 4. Broken demo Identity/callback routing | Persistent Identity store separated from per-token sandbox data; simulated automation and session-scoped uploads; bounded caches. | Demo sessions and persistent Identity HTTP test |
| 5. Acknowledgement treated as completion | Durable state machine; acknowledgement only dispatches; callback saves results and completion atomically. | Outbox acknowledgement and timeout tests |
| 6. Polling missing/previous logs | Queued run saved before return; polling by run ID; unknown/pending states retry within deadline. | API run persistence and frontend polling |
| 7. Lost fire-and-forget work | Database outbox with hosted dispatcher, leases, retries, deadlines, terminal failures, admin retry. | Outbox restart/pending dispatch, conflicts and retry limits |
| 8. Wrong interview round | Saved StageDetailId carried through dispatch/callback; application/stage/run validated. | Saved-round generation HTTP test |
| 9. Stale JWT authority | Account, security stamp, lockout and current roles checked on every validated token; shorter lifetime. | Demotion/deletion revocation and self-role safeguards |
| 10. Conflicting fit scores | One IFitScorer for board/detail with weighted breakdown and semantic fallback. | Actual service and canonical board/detail tests |
| 11. Lost requirement importance | Structured controlled editor; importance retained; version conflicts; edited requirements invalidate embeddings and stale run pointers. | Requirements edits/metadata/callback tests |
| 12. Misleading proficiency claims | Ratings labeled personal notes; scoring remains binary ownership with importance. | Proficiency changes leave fit unchanged |
| 13. Lost overlapping skill edits | Per-skill add/delete/level endpoints, PostgreSQL upserts, functional state updates, per-row pending Set. | Service normalization and API mutation tests |
| 14. Stale requirement/stage drafts | Controlled requirements; clean drafts follow server version; dirty forms retain original version and survive callback updates. | Forms and versioned-draft tests |
| 15. Unrelated/stale question polling | Poll exact run and round; no overlapping interval requests; route/session cleanup and response sequencing. | Poll abort/in-flight suppression and request-contract tests |
| 16. Incorrect activity semantics | User edits update activity/timeline; employer responses explicit; automation is separate. | Note/activity/employer-response HTTP test |
| 17. Generated questions shown as user notes | Separate GeneratedQuestions field, displayed with provenance. | Saved-round callback preserves personal notes |
| 18. Incomplete account deletion | Owned data/receipts/runs removed, Identity errors checked, sessions revoked, durable storage cleanup. | Full owned-data deletion test |
| 19. Resume/profile race and bad vectors | Extraction per resume, explicit active selection, current proposal run/version required, finite nonzero 1536-dimensional validation. | Resume activation/proposal and vector tests |
| 20. Duplicate/concurrent skills fail | Normalized groups with maximum metadata, tracked entity reuse, PostgreSQL unique-name upsert; null elements rejected. | Resolver, duplicate callback, null input, PostgreSQL race tests |
| 21. Health path/state loss | /healthz/readiness, separate live/ready routes, request timeouts, nonblocking banner and extraction review. | Health HTTP and mounted-form preservation tests |
| 22. Unsafe role replacement | Role allowlist, atomic operations, immutable self ID, self/last-admin safeguards, checked Identity results. | Role revocation/validation HTTP tests |

## Secondary issues

Status changes use canonical server responses and versions; per-application pending state prevents conflicting UI writes. List/search requests are sequenced or cancelled, provider polling is cleaned up on session change, and the shared update callback is stable.

Skills Gap returns complete aggregates with extraction coverage and only exposes trends after enough samples. Interview forms have unique accessible IDs, saved round records, explicit UTC instants and time zones; date-only values stay calendar dates. Resume review can close, reopen, poll or retry without blocking the tracker; accepted evidence persists.

Storage keys are generated and URI-escaped. Upload signatures, DOCX expansion, parser resource limits, URL/redirect constraints and API boundary validation are enforced. Login uses throttling and Identity lockout. Outbound triggers include the automation key. Application queries are paginated and scoring groups links once; the client currently retrieves all pages for its board, so it is not a virtualized unlimited-data UI.

Unused combined skills/resume page, starter assets, duplicate resolver/DTO paths and misleading copy were removed. Legacy unused persisted columns (JobEmbedding, experience, seniority, education) remain for non-destructive schema compatibility; current workflows/contracts no longer collect them. Profile/resume evidence now has a visible and persisted purpose.

## Implemented product changes

Application editing and Saved status; search/filter/sort including deadlines; follow-up, snooze, response and contact fields; assessment/interview/offer deadline alerts; opt-in notification templates with delivery deduplication; linked alerts; bulk archive/undo; selected resume per application; fit breakdown; CSV/JSON import/export; manual notes; weekly digest template; stage-duration funnel metrics; browser capture bookmarklet.

CSV is a subset of the JSON backup. Binary resumes and complete audit history are not exported. Browser capture creates a prefilled Saved application and does not bypass validation. Digest/deadline delivery needs real n8n/provider configuration. Per-user local-time scheduling, cover-letter generation and public sharing were not introduced.

## DevOps changes

PR CI and deployment CI share gates. Deployment uses the tested SHA, serialized MonsterASP releases, migration checks and post-deployment smoke tests. CI installs PostgreSQL/pgvector and Python dependencies directly on its runners, verifies database restore including vector values, and scans the checkout for secrets. Sanitized n8n workflow exports and regression fixtures remain. Local startup uses Visual Studio 2022 and VS Code; frontend deployment remains Netlify. Unused container and Terraform infrastructure, the root environment files, and the standalone fixture launcher were removed without removing the repaired application behavior or its tests.

No checks open a hosted user database. PostgreSQL integration requires a loopback disposable database; CI rejects skips. n8n templates are inactive and contain placeholder hosts, sender/model and credential references.

## Local verification

| Check | Result |
| --- | --- |
| API tests | 51 passed; 1 PostgreSQL integration test skipped locally |
| Frontend tests | 16 passed |
| n8n/fixture contract tests | 4 passed |
| Parser tests | 6 passed |
| Frontend strict lint / formatting / production build | Passed; main chunk about 389 kB |
| npm audit | 0 reported vulnerabilities |
| EF model consistency / idempotent migration SQL | Passed/generated |
| Visual Studio project / launch profiles | Container tooling removed; HTTP, HTTPS and IIS Express preserved |
| GitHub workflow YAML syntax | Passed |
| Gitleaks current-checkout scan | Passed |
| Git whitespace validation | Passed |

Native PostgreSQL integration/restore checks and live n8n/provider execution remain unverified locally. PostgreSQL checks are CI gates; the updated workflow has not been executed remotely during this cleanup. Production migration, hosting, credential rotation, history rewriting and legacy external-file reconciliation were not performed. The retained parser is a secure workflow component, not a new requirement for starting the frontend or API.

Run local checks using `./scripts/verify.ps1`. Use `./scripts/verify.ps1 -RequirePostgres` with the isolated test connection for the database gate. [docs/operations.md](docs/operations.md) and [n8n/README.md](n8n/README.md) specify operational setup and remaining external work.
