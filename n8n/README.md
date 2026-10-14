# n8n automation contracts

These six inactive exports are sanitized workflow templates. Static contract tests execute their Code nodes and verify paths, correlation, authentication, and execution-data settings. Import, node-version compatibility, provider responses, credentials, and live execution still require validation in the target n8n instance.

## Setup

1. Import each `*.workflow.json` into an isolated n8n instance.
2. Replace every `https://YOUR_API_HOST` with the API base URL. All callbacks must reach the same database as the dispatcher.
3. Create an HTTP Header Auth credential named `Job Tracker automation key`: name `X-Automation-Key`, value matching server-only `Automation:ApiKey`. Assign it to webhook authentication and internal API requests. Replace placeholder credential IDs by selecting the real credential.
4. Configure the completion-provider URL, model, and header credential. The completion nodes use the OpenAI-compatible chat-completions wire format; verify that the selected provider returns `choices[0].message.content` containing the requested JSON. Provider credentials stay in n8n's encrypted credential store.
5. For resume processing, run the private `parser` service, configure `PARSER_API_KEY` and the exact `RESUME_DOWNLOAD_HOST`, set the parser-node URL, and select an `X-Parser-Key` Header Auth credential. The parser accepts only signed HTTPS URLs for that host's private `resumes` bucket.
6. For reminders/digest, replace the sender with a verified address and configure the Resend authorization credential. Preserve the provider idempotency key and the API delivery lease.
7. Activate validated workflows. Configure API URLs for the production webhook paths `/webhook/jobtracker-skills`, `/webhook/jobtracker-questions`, and `/webhook/jobtracker-resumes`; test-webhook URLs are temporary.

Use your existing n8n instance. Configure the API with its base URL and the three active production webhook URLs. Local callbacks must reach the API address used by Visual Studio; production callbacks target the HTTPS MonsterASP origin. A workflow that uses the retained secure parser requires a running parser endpoint and the matching X-Parser-Key credential. It is independent of frontend/backend startup.

## Payloads and timing

Every dispatch includes `schemaVersion: 1` and a UUID `runId`:

| Workflow | Additional dispatch fields | Success callback |
| --- | --- | --- |
| Skills | applicationId, rawDescription | PUT /api/internal/applications/{id}/skills |
| Questions | applicationId, stageDetailId, jobTitle, company, jobDescription, resumeText | PUT /api/internal/applications/{id}/interview-questions |
| Resumes | resumeId, downloadUrl | PUT /api/internal/resumes/{id}/extraction |

Skills callback: `{runId, skills: [{name, importance}], requirementsEmbedding?}`.
Questions callback: `{runId, stageDetailId, questions}`.
Resume callback: `{runId, extractedText, skills: [{name, evidence, strength}], resumeEmbedding?}`.

Skills are normalized and duplicates use maximum importance/strength. Importance must be 1–3; strength must be finite and 0–1. Embeddings, when supplied, must have exactly 1536 finite values and nonzero magnitude. Missing embeddings enable keyword coverage without a semantic signal.

The supplied templates do not generate embeddings. To enable semantic fit, add provider embedding calls for the extracted requirement text and resume text using the same model/version with 1536 output dimensions, then include the vector in the matching callback. Do not fabricate vectors or mix models. Record the chosen provider/model/version in the workflow release notes.

Webhook response is immediate acknowledgement. The workflow claims `POST /api/internal/runs/{runId}/claim` before expensive processing. Duplicate/terminal claims stop processing. Success is saved atomically with callback completion. Replaced resource/run callbacks return 409; duplicate callbacks for an already successful run return 200 without rewriting data.

Workflow failures call `POST /api/internal/runs/{runId}/state` with `{status: "failed"}`. A lost execution or callback becomes `callback_timeout` after ten minutes. Templates cap execution at eight minutes. Dispatcher leases last one minute, use a 20-second outbound timeout and at most four dispatch attempts. A failed execution needs an API retry with a new run ID; it must not replay an old successful result over a newer edit.

Reminder endpoints return only opted-in recipients. Delivery claims expire after five minutes. Completion requires the lease token. Provider idempotency protects a successful send whose completion acknowledgement was lost. Default schedules run at 08:00 UTC daily and on Monday weekly; date-only deadline interpretation uses the user's time zone. The schedule is not a per-user local-time scheduler.

## Privacy and operations

Exports disable saved successful, failed, and manual execution data. Prompts, extracted text, signed download URLs, and provider responses contain personal data; leave execution-history storage disabled. Parser logs omit request URLs. Legacy API automation message bodies are scrubbed by the new migration.

Preserve your existing n8n encryption key across upgrades and backup/restore. Its database and credentials remain separate operational resources from application data. This repository does not create or replace your n8n hosting.

Primary references: [Webhook response/authentication](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/), [health monitoring](https://docs.n8n.io/hosting/logging-monitoring/monitoring/).
