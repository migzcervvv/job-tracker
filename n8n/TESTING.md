# Testing the published workflows

Use the deployed frontend and MonsterASP API together. Sign in with a normal account whose email address you control. The demo account simulates automation; it cannot prove that n8n works. Use disposable applications and a small test resume without personal information. Record the time, application/resume ID, processing run ID, and result for each test. AI processing can incur provider charges; notification tests send real email to opted-in users.

## 1. Verify configuration before triggering work

Check the settings in your **published n8n workflows**, not just the local exports. Publishing does not replace placeholders or configure credentials. The repository exports still contain these values:

| Setting | Required value |
| --- | --- |
| `YOUR_OPENAI_COMPATIBLE_PROVIDER` and `CONFIGURE_PROVIDER_MODEL` | Working chat-completions endpoint/model in skills, questions, and resumes, with the matching provider credential |
| `YOUR_DOCUMENT_PARSER_HOST` | Reachable private document parser `/extract` endpoint in resumes, with its `X-Parser-Key` credential |
| `CONFIGURE_VERIFIED_SENDER` | Verified Resend sender in stale, deadlines, and weekly, with its Resend credential |
| `YOUR_FRONTEND_HOST` | Your deployed Netlify hostname in stale/deadline email links |
| `CONFIGURE_IN_N8N` credential references | Select the actual n8n credentials on each node |

On webhook triggers and internal API requests, the Header Auth credential must send `X-Automation-Key` matching the backend's `Automation:ApiKey`. The parser uses a **different** key, `X-Parser-Key`. Never put either key in the client or an issue/screenshot.

The API's three configured webhook URLs must use the published `/webhook/` paths: `jobtracker-skills`, `jobtracker-questions`, and `jobtracker-resumes`. `/webhook-test/` is temporary. All callback URLs must reach the same API/database that creates the runs. Hosted n8n cannot call a Visual Studio `localhost` address.

Open `https://jtrackerch.runasp.net/api/health/live` and `/api/health/ready`. Both should return success. An administrator can check **Administration → System status** and **Processing history**. A healthy n8n connectivity check alone does not prove authentication, parsing, AI processing, or callbacks work.

## 2. Test the three application-triggered workflows

Trigger these from the app. An empty manually executed webhook has no real run ID and will fail validation. The app creates the IDs used to accept callbacks safely.

### Skills

1. Create a disposable application with this description: `Platform Engineer. Required: Linux, PostgreSQL, Git. Preferred: Terraform. Nice to have: Python.` Save it. If automatic processing has not started, open its skills editor and select **Find skills automatically**.
2. Verify that a corresponding skills execution reaches n8n. Processing history should move through queued/processing states to completed. The frontend labels summarize the backend states `queued`, `dispatched`, `running`, and `succeeded`; intermediate states may complete too quickly to observe.
3. Refresh the application. The extracted job skills should be saved to this application. Required skills should generally have higher importance than preferred/nice-to-have skills; exact AI wording can vary.
4. Edit and save one skill manually. Reload and verify the edit persists. The standard templates do not produce embeddings, so a missing semantic comparison is expected.

### Resumes

1. Create a small PDF or DOCX containing: `Test Candidate. Built PostgreSQL reporting queries, maintained Linux servers, and used Git for version control.` Keep it below 9.5 MB and upload it under **Resumes**.
2. Verify the parser and AI nodes execute, the run completes, and **Review skills** shows evidence-backed suggestions.
3. Confirm selected skills. Open **My skills** and verify they were added. Dismiss an unwanted suggestion and verify it was not added.
4. Select **Make default** explicitly. Uploading or extracting another resume must not silently change the default. Test PDF and DOCX separately if you use both formats; a scanned/image-only PDF may have no extractable text.

### Interview questions

1. On the disposable application, add and **save** an interview round. Use a default resume with completed extraction for useful resume-specific questions.
2. Request questions from that saved round. Verify n8n completes and questions appear on that exact round after refresh.
3. Add notes, create a second round, and generate its questions. Verify the first round's questions and notes remain intact and the second result belongs to the second round.

Allow several minutes for AI/parser processing. Runs have a ten-minute callback deadline; an immediate webhook success response is only acknowledgement, not completed processing.

## 3. Test scheduled email workflows

Use the n8n editor's **Execute Workflow** control to run each scheduled workflow immediately ([n8n execution documentation](https://docs.n8n.io/workflows/executions/manual-partial-and-production-executions/)). These executions query current eligible users, so they can email **every** eligible opted-in account. For isolated tests, use a staging API/database and test recipient; on production, account for every enabled recipient before executing. Do not manually execute only the send node with stale data because it must follow the notification claim.

In **Account settings**, save your correct time zone, enable reminders for reminder tests, and enable the weekly digest for the digest test. Use your own email address.

| Workflow | Test data and action | Passing result |
| --- | --- | --- |
| Deadlines | Give an active test application a follow-up due in the next 12 hours. Save, then run deadlines. | One reminder with the correct application and a working Netlify link. |
| Stale applications | Use an active, unsnoozed test application last updated more than **seven days** ago, then run stale. Changing only its applied date does not make it stale. | One reminder for that application. Freshly created or edited records correctly produce none. |
| Weekly digest | Enable weekly digest, save a few test applications, then run weekly. | One email with counts/content matching that account's current applications. |

For a faster isolated stale test, the fetch endpoint accepts `?days=1`, but still requires a record untouched for more than 24 hours. Restore the workflow's normal URL afterwards. Do not backdate production database records to force a test.

Run the same email workflow again after the first delivery completes. Expect no duplicate delivery for the same delivery key: reminders use a UTC calendar day and digests use a weekly key. An already-claimed/completed delivery can legitimately be skipped. Empty fetch results mean no eligible records; they do not prove the send node works.

Disable the test account's reminders/digest and rerun. It should receive no email. Close or snooze the test application and verify it is excluded from reminders. Default schedules are 08:00 UTC daily for reminders and Monday 08:00 UTC for the digest: **16:00 in Asia/Shanghai**. Per-user time zones interpret dates; they do not change the n8n trigger schedule. After manual tests, verify a real scheduled run occurs at its configured time.

## 4. Verify failure and recovery in staging

1. In a staging workflow, temporarily select an invalid AI credential or unreachable provider URL and publish that change. Trigger a disposable skills run from the staging app. Verify it becomes failed with a useful message, while the saved application stays usable. A lost callback should eventually become `callback_timeout` instead of remaining in progress forever.
2. Restore the correct configuration and publish it. Use **Find skills automatically** or **Find skills again** in the app to create a **new run ID**. Verify it completes. Do not replay an old n8n execution as the retry mechanism.
3. Verify the browser remains usable during processing and refreshing shows the eventual saved result. Backend contract/integration tests cover duplicate claims, stale callbacks, and idempotency; do not fabricate production callbacks to test those cases.

## 5. Diagnose by the last successful boundary

| Symptom | Check |
| --- | --- |
| No n8n execution | Production webhook URL, published workflow, backend dispatcher, and queued run in processing history |
| 401/403 on webhook or callback | Correct Header Auth credential and backend `Automation:ApiKey` |
| Parser fails | Deployed parser endpoint, parser key, exact Supabase download host, signed URL expiry, extractable PDF/DOCX content |
| AI fails | Provider endpoint, model access, credential, quota, and JSON response format |
| AI succeeds but app never updates | Callback URL, callback node result, same backend/database, matching run/resource/round IDs |
| Callback or claim returns 409 | Duplicate/expired/replaced run; start a fresh app-triggered run rather than replaying it |
| No email | Opt-in saved, eligible record, verified Resend sender, provider credential, prior delivery claim, spam folder |
| Email link is wrong | Replace `YOUR_FRONTEND_HOST` in the published reminder workflows |

Workflow exports disable saved successful, failed, and manual execution data because resumes and signed URLs contain private data. Use the current manual execution view and backend processing history for evidence. Missing retained n8n history alone is not a failure. Do not enable persistent production payload logging to troubleshoot test resumes.

## 6. Run repository checks separately

From the repository root:

```powershell
node --test scripts/contracts.test.mjs
```

From `client`:

```powershell
npm ci
npm test
npm run lint
npm run format:check
npm run build
```

These validate local contracts and frontend behavior. They do not contact your published n8n workflows or prove your production credentials work. The GitHub Actions pipeline also runs backend checks; its fixture automation tests are separate from the live checks above.
