# Live n8n verification — 14 October 2026

The n8n instance is reachable and all six workflows are published. Application and resume extraction are blocked by routing and webhook authentication. Provider processing and successful callbacks have not been verified end to end.

## Observed checks

| Check | Observed result | Meaning |
| --- | --- | --- |
| Deployed API `/api/health/live` | HTTP 200, `healthy` | API is running |
| Deployed API `/api/health/ready` | HTTP 200, `healthy` | API database readiness passes |
| Deployed API `/api/health/n8n` | HTTP 200, `healthy` | Misleading: current checker accepts an HTML fallback |
| n8n `/healthz` | HTTP 404 | Expected health route unavailable |
| n8n `/healthz/readiness` | HTTP 200, editor HTML | Does not prove n8n readiness |
| Local configured skills URL, POST `/webhook/extract-skills` | HTTP 404, webhook not registered | Does not reach the published skills workflow |
| Published skills URL, POST `/webhook/jobtracker-skills` | HTTP 403, `Authorization data is wrong!` | Rejects the API's configured automation key |
| Local configured resume URL, POST `/webhook/extract-resume` | HTTP 404, webhook not registered | Does not reach the published resume workflow |
| Published resume URL, POST `/webhook/jobtracker-resumes` | HTTP 403, `Authorization data is wrong!` | Rejects the API's configured automation key |
| Deployed API read-only internal endpoint with that same automation key | HTTP 200, JSON | The key is accepted by the deployed API |
| Published workflow Code nodes | All eight compile; synthetic dispatches accepted | Valid syntax and dispatch validation alone do not prove provider processing |
| API login using locally configured bootstrap credentials | HTTP 401 | Cannot start an authenticated app/resume test using those credentials |

Webhook probes used an empty JSON object. Both published webhooks rejected authentication before execution. No personal resume, real job posting, provider call, or fabricated completion callback was submitted. The POST method was used for route checks because these workflows do not register GET webhooks.

The webhook URL mismatch is verified against local Visual Studio user secrets. Production webhook settings were not available for inspection. The automation key from those secrets was accepted by the deployed API, but rejected by both published n8n webhooks. No secret values are included here.

## Published application skills workflow

Workflow: **Job Tracker skills v1**, ID `lh489BOZxtRPbTqg`.

- Published webhook path is `jobtracker-skills`.
- Webhook Header Auth currently selects **OpenAI**.
- Claim and callback requests select **Job Tracker automation key**.
- The extraction provider is Groq, model `llama-3.3-70b-versatile`.
- Its claim, skills callback, and failure callback point to the deployed MonsterASP API.
- No retained executions were shown in this workflow's execution history during inspection.

The webhook must select the automation credential with header name `X-Automation-Key` and the same value accepted by the API. Provider credentials belong on provider request nodes. The API skills URL must end in `/webhook/jobtracker-skills`.

## Published resume workflow

Workflow: **Job Tracker - Resume extraction hybrid v2**, ID `XP71uXkCW0MbEj4p`.

- Published webhook path is `jobtracker-resumes`.
- Webhook Header Auth currently selects **Groq AI**.
- Claim and callback requests select **Job Tracker automation key**.
- The downloaded file is passed directly to an **Extract PDF** node. There is no DOCX parser branch.
- Groq extracts skills, with an OpenAI fallback. A Gemini embedding call requests 1536 dimensions before completion.
- The download-host allowlist matches the locally configured Supabase host.
- A failed embedding currently prevents the already extracted skills from reaching the success callback.

Five IF conditions contain malformed expressions:

| Node | Current expression | Required expression |
| --- | --- | --- |
| Claim allowed | `={ $json.status }` | `={{ $json.status }}` |
| Text valid | `={ $json.ok }` | `={{ $json.ok }}` |
| Groq valid? | `={ $json.ok }` | `={{ $json.ok }}` |
| OpenAI valid? | `={ $json.ok }` | `={{ $json.ok }}` |
| Embedding valid? | `={ $json.ok }` | `={{ $json.ok }}` |

`Claim allowed` compares the malformed string against `running` and routes to **Done** instead of downloading the resume. The remaining conditions also fail to reference the boolean validation result correctly. These conditions must be corrected and published before a successful run is possible.

The resume webhook must select the automation credential. The API resume URL must end in `/webhook/jobtracker-resumes`. DOCX support requires a separate parser path; the currently published workflow only parses PDFs. Embedding should be optional if the priority is extracting and reviewing skills when the embedding service is unavailable.

## Local repair and verification limits

The global execution list showed four retained executions of **Job Tracker deadlines notifications v1** (IDs 393–396), all marked **Success**. In the latest run, ID 396, **Fetch notifications1** returned **No output data returned**. Execution stopped there; the email node did not run. This verifies a successful eligible-recipient lookup, not email delivery. No retained skills, resume, question, stale, or weekly executions were visible in that list. Scheduled email workflows were not manually triggered during these checks.

The API health checker now requires a JSON readiness response containing `status: "ok"`. HTML fallback pages no longer count as healthy. All 74 backend tests passed, including six new health-check regressions, along with all five repository automation contract tests. The PostgreSQL integration test was skipped because no disposable test database is configured. This code change has not been deployed.

The published workflows and credentials were inspected and exported through the existing n8n browser session. Their published configuration was not changed. A completed app-triggered extraction, provider quota/access, PDF parsing, fallback execution, Gemini output, and saved success callbacks remain unverified. Correct routing, webhook credentials, and resume IF expressions first; then test with a disposable application and PDF through an authenticated normal API account. The demo account cannot prove external processing.
