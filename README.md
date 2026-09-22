# job.tracker

A multi-user job application tracker that reads your resume and every job description you paste, then tells you where you actually stand: which skills you're missing that employers keep asking for, how well each posting matches you, and which applications have gone quiet.

Built solo as a portfolio project — .NET 8 API, React frontend, PostgreSQL with pgvector, and an n8n automation layer handling the LLM work.

---

## Live demo

|            |                                        |
| ---------- | -------------------------------------- |
| App        | `<https://job-trackerch.netlify.app/>` |
| Test login | `<u: test@test.test p: Testing123>`    |

Registration is closed by design — accounts are created by an admin. See [Bootstrapping](#bootstrapping) if you're running this yourself.

---

## What it does

**Pipeline tracking.** Kanban board across `Applied → Assessment Pending → Assessment Sent → Interview Scheduled → Offered`, plus terminal states. Drag between columns, or set status from the detail view when a transition isn't reachable by drag. Every status change writes a timeline event automatically.

**Per-stage detail.** Each stage has its own fields — assessment links and due dates, interview rounds with times and interviewers, offer salary and decision deadlines. Interview rounds append rather than overwrite, so a three-round process keeps all three.

**Skill extraction.** Paste a job description and n8n pulls the required skills out of it, rating each as required / preferred / nice-to-have. Upload a resume and it does the same for your own skills — but resume-derived skills are _proposed_, not applied. You review them with the evidence the model found, uncheck anything that isn't really yours, and confirm.

**Fit scoring.** Every application gets a percentage combining two signals: how many of its required skills you have (weighted by how hard a requirement each one is) and cosine similarity between your resume embedding and the posting's requirements embedding. Skill match dominates the blend because it's explainable — the semantic score catches what keyword matching misses.

**Skills gap.** Four ranked views: your biggest gaps weighted by requirement strength, your strengths, skills rising across your recent applications, and skills fading out.

**Pipeline alerts.** Applications with no activity in N days, applications that never got a reply, and how many you've sent this week.

**Interview prep.** On an interview-stage application, generate likely questions from that job description and your resume — including questions targeting gaps between the two. Results land in that round's prep notes.

---

## Why n8n rather than doing it in the API

Email watching, LLM calls, embeddings, and notification delivery are external-service glue, not application logic. Keeping them in n8n means the .NET API stays a plain CRUD-plus-business-rules service — testable without mocking an LLM, deployable without an API key, and not coupled to any one model provider. Swapping Groq for OpenRouter is a node config change, not a redeploy.

The API calls n8n fire-and-forget: the HTTP response returns before the webhook is even attempted, so a slow or failed automation can never turn into a failed user action. Failures land in an admin-visible automation log instead.

---

## Architecture

```
┌─────────────┐     HTTPS      ┌──────────────────┐    session pooler   ┌──────────────┐
│  React UI   │───────────────▶│  .NET 8 Web API  │────────────────────▶│  PostgreSQL  │
│   (Vite)    │◀───────────────│   ASP.NET Core   │◀────────────────────│  + pgvector  │
│   Netlify   │    JSON/JWT    │   MonsterASP     │                     │   Supabase   │
└─────────────┘                └────────┬─────────┘                     └──────────────┘
                                        │ X-Automation-Key
                                        ▼
                               ┌──────────────────┐
                               │   n8n  ·  GCP    │
                               └────────┬─────────┘
                        ┌───────────────┼───────────────┐
                        ▼               ▼               ▼
                 ┌────────────┐  ┌────────────┐  ┌────────────┐
                 │ Groq LLM   │  │  Gemini    │  │  Telegram  │
                 │ extraction │  │ embeddings │  │  reminders │
                 └────────────┘  └────────────┘  └────────────┘
```

Four independently deployed services across four providers. The only contracts between them are a JWT (frontend ↔ API) and a shared automation key (API ↔ n8n).

**Flow:** paste a JD → API commits and fires a webhook → n8n extracts skills with importance ratings and generates a 1536-dim embedding → posts both back to an internal endpoint → the board shows a fit score.

---

## Tech stack

![.NET](https://img.shields.io/badge/.NET-8-512BD4)
![React](https://img.shields.io/badge/React-Vite-61DAFB)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector-3ECF8E)
![n8n](https://img.shields.io/badge/n8n-automation-EA4B71)
![GitHub Actions](https://img.shields.io/badge/CI%2FCD-GitHub%20Actions-2088FF)

| Layer      | Choice                                 | Why                                                                                             |
| ---------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Backend    | .NET 8, EF Core, ASP.NET Core Identity | Typed, first-class auth, query filters for tenancy                                              |
| Database   | PostgreSQL + pgvector (Supabase)       | Vector similarity in the same database as everything else — no separate vector store to operate |
| Storage    | Supabase Storage, private bucket       | Resumes are PII; signed URLs only                                                               |
| Frontend   | React + Vite, dnd-kit, framer-motion   | Fast dev loop, small bundle, route-level code splitting                                         |
| LLM        | Groq (OpenRouter fallback)             | Free tier, OpenAI-compatible so provider swaps are config-only                                  |
| Embeddings | Gemini `gemini-embedding-001` @ 1536d  | Free tier, dimension matches the schema                                                         |
| Automation | n8n on GCP                             | Decouples external services from the core app                                                   |
| CI/CD      | GitHub Actions → Web Deploy            | Tests gate deployment                                                                           |

---

## Design decisions worth calling out

**Multi-tenancy is structural, not remembered.** A global EF Core query filter scopes every tenant entity to the user in the JWT:

```csharp
builder.Entity<Application>()
    .HasQueryFilter(a => _currentUserId == null || a.UserId == _currentUserId);
```

Forgetting a `WHERE UserId = ...` isn't possible, because there is no such clause to forget. Resource lookups return 404 rather than 403 for another user's row, so existence doesn't leak. There's an automated regression test for this using EF Core's InMemory provider, not just a manual check.

The `_currentUserId == null` branch deliberately makes the filter inert for requests with no JWT — that's how the n8n-facing internal endpoints, authenticated by `X-Automation-Key` instead, read across users.

**Automation proposes; the user decides — but only where it's a claim about them.** Skills extracted from a _job posting_ apply automatically: they describe the posting, not you. Skills extracted from your _resume_ go into a review queue first, because "you know Kubernetes" is a claim about you and an LLM shouldn't make it unchallenged. Same principle, opposite conclusion, because the subject differs.

**Fit score blends explainable and semantic.** 70% importance-weighted skill overlap, 30% embedding cosine similarity, rescaled — raw cosine over text embeddings rarely drops below ~0.3 even for unrelated documents, so reporting it directly would make everything look like a great match.

**Embeddings are normalized by hand.** `gemini-embedding-001` only returns pre-normalized vectors at its native 3072 dimensions. Truncating to 1536 breaks that, so a Code node L2-normalizes before the vector is stored — otherwise every cosine calculation downstream is quietly wrong.

---

## Project structure

```
job-tracker/
├── client/                      React (Vite)
│   ├── src/api/                  axios client, per-domain API modules
│   ├── src/auth/                 AuthContext, JWT storage
│   ├── src/state/                shared applications store
│   ├── src/components/           board, modals, editors
│   └── src/pages/                board, alerts, skills gap, admin/
└── JobTracker.Api/              .NET 8 Web API
    ├── Controllers/              Auth, Applications, Skills, Resumes,
    │                             Analytics, Admin, Profile, Internal
    ├── Data/                     DbContext + tenant query filters
    ├── Models/                   Application, StageDetail, TimelineEvent,
    │                             Skill, Resume, UserProfile
    ├── Services/                 tokens, storage, skill resolver, fit scorer
    └── JobTracker.Api.Tests/     xunit
```

---

## Running locally

**API**

```
cd JobTracker.Api
dotnet user-secrets set "ConnectionStrings:Default" "<Supabase session pooler string>"
dotnet user-secrets set "Jwt:Key" "<32+ char random string>"
dotnet user-secrets set "Jwt:Issuer" "jobtracker-api"
dotnet user-secrets set "Automation:ApiKey" "<random string>"
dotnet user-secrets set "Supabase:Url" "https://<ref>.supabase.co"
dotnet user-secrets set "Supabase:ServiceRoleKey" "<service_role key>"
dotnet user-secrets set "Bootstrap:AdminEmail" "you@example.com"
dotnet user-secrets set "Bootstrap:AdminPassword" "<temporary password>"
dotnet ef database update
dotnet run
```

Use Supabase's **session pooler** connection string, not the direct one — the direct host resolves IPv6-only on most projects and will fail with `No such host is known` on networks without working IPv6.

**Client**

```
cd client
npm install
npm run dev
```

Set `VITE_API_URL` in `client/.env.local` to the API's URL (check `launchSettings.json` for the port).

**Tests**

```
cd JobTracker.Api.Tests
dotnet test
```

### Bootstrapping

Public registration is closed. On first startup, if no admin exists, the API seeds one from `Bootstrap:AdminEmail` / `Bootstrap:AdminPassword`. The check is `existingAdmins.Count == 0`, so it's inert on every subsequent boot — safe to leave configured permanently. **Change that password from the Profile page after first login**; it sits in plaintext in your secrets store.

---

## Deployment

| Layer      | Host           | Mechanism                                                          |
| ---------- | -------------- | ------------------------------------------------------------------ |
| Frontend   | Netlify        | Git integration, auto-builds on push to `client/**`                |
| API        | MonsterASP.NET | Web Deploy via publish profile, GitHub Actions on `windows-latest` |
| Database   | Supabase       | Managed                                                            |
| Automation | n8n on GCP     | Self-hosted                                                        |

Netlify needs `client/public/_redirects` containing `/*  /index.html  200`, or any non-root route 404s on refresh.

CORS is configured as an array so local dev and the deployed frontend both work without swapping config. In production these bind as indexed environment variables: `Cors__Origins__0`, `Cors__Origins__1`.

---

## Testing

Unit tests cover skill name normalization, importance-weighted fit math, cosine similarity, and — most importantly — multi-tenant isolation, verified with the EF Core InMemory provider rather than by hand. The CI pipeline runs `dotnet test` before the deploy step, so a failing test physically blocks release.

Not covered: HTTP-level integration tests (`WebApplicationFactory`) and coverage reporting. Both are the obvious next additions.

---

## Roadmap

- [x] JWT auth, tenant-isolated applications, role-based admin
- [x] Kanban board, stage details, timeline
- [x] Skill extraction from job descriptions via n8n
- [x] Resume upload, extraction, and confirm-gated skill claiming
- [x] Skills gap with importance weighting and trend
- [x] Fit scoring (skill overlap + embedding similarity)
- [x] Pipeline alerts, admin panel, system health, automation log
- [x] Interview question generation
- [ ] Stale reminders and weekly digest delivery
- [ ] Integration tests and coverage reporting

**Dropped:** Gmail confirmation matching. The fuzzy-matching accuracy problem and the Gmail API surface weren't worth the complexity relative to everything else here.

**Stretch:** cover-letter tailoring, a "track this job" browser extension, public read-only share links.

---

## Known limitations

- Trend and rising/fading signals are noisy below a few dozen applications — the calculation splits your history in half and compares, which is sensitive to small samples.
- The hosted API sleeps when idle; the first request after a lull is slow, including scheduled n8n calls.
- Admin self-protection (can't demote or delete yourself) is enforced in the UI but not the API.
- Free-tier LLM rate limits will occasionally fail an extraction. It's logged and retryable by hand, not silently lost.
