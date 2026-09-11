# Job Tracker
 
A multi-user job application tracker built to stop losing track of 40+ applications in a spreadsheet. Paste a job description in, and the pipeline — assessments, interviews, offers — tracks itself: status changes log a timeline automatically, skills get extracted from every JD you paste, and a Skills Gap view shows which of the most-requested skills across your applications you actually have.
 
Built as a full-stack portfolio project: .NET 8 API, React frontend, Postgres, and an n8n automation layer that handles the parts that don't belong in the core app — email confirmation matching, LLM skill extraction, stale-application nudges.
 
---
 
## Live demo
 
| | |
|---|---|
| App | `<add once deployed>` |
| Test login | `<add a demo account once seeded>` |
 
---
 
## Why n8n, not just the API?
 
Email watching, LLM calls, and notification delivery are external-service glue, not core application logic. Keeping them in n8n instead of the .NET backend means the API stays a plain CRUD + business-rules service — testable, deployable independently, and not coupled to Gmail's API or a specific LLM provider. n8n proposes; the user always confirms. Paste is the only source of truth — email never creates a record, it only annotates one that already exists.
 
---
 
## Architecture
 
```
┌─────────────┐      ┌──────────────────┐      ┌─────────────┐
│  React UI   │─────▶│  .NET 8 Web API  │─────▶│  PostgreSQL │
│  (Vite)     │◀─────│                  │◀─────│  (Supabase) │
└─────────────┘      └───────┬──────────┘      └─────────────┘
                              │
              ┌───────────────┼───────────────────┐
              ▼                ▼                   ▼
        ┌──────────┐    ┌────────────┐     ┌──────────────┐
        │   n8n    │    │  LLM API   │     │    Gmail     │
        │  (GCP)   │◀──▶│ (extract / │     │   (watch)    │
        └──────────┘    │   match)   │     └──────────────┘
                         └────────────┘
```
 
**Data flow**
1. Paste a job description → API creates the application → fires a webhook to n8n → n8n's LLM node extracts skills → posts them back to the API.
2. Gmail receives a confirmation email → n8n's Gmail trigger fires → LLM extracts company/title → n8n asks the API for candidate matches → proposes a timeline event → user confirms or rejects in the UI.
3. Scheduled n8n workflows query the API for stale applications and weekly stats → deliver a Telegram nudge or an email digest.
---
 
## Tech stack
 
![.NET](https://img.shields.io/badge/.NET-8-512BD4)
![React](https://img.shields.io/badge/React-Vite-61DAFB)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-3ECF8E)
![Docker](https://img.shields.io/badge/Docker-optional-2496ED)
![n8n](https://img.shields.io/badge/n8n-automation-EA4B71)
![GitHub Actions](https://img.shields.io/badge/CI%2FCD-GitHub%20Actions-2088FF)
 
| Layer | Choice | Why |
|---|---|---|
| Backend | .NET 8 Web API, EF Core | Strongly typed, first-class Identity + JWT support |
| Auth | ASP.NET Core Identity + JWT | Role-claim-based, multi-user safe from day one |
| Database | PostgreSQL (Supabase) | Managed, free tier, no infra to babysit |
| Frontend | React + Vite | Fast dev loop, small production bundle |
| Charts | Recharts | Skills Gap bar chart |
| Automation | n8n | Gmail watching, LLM extraction, scheduled digests |
| CI/CD | GitHub Actions | Build → test → deploy on push to `main` |
| Hosting | Render / MonsterASP (TBD) — API · Vercel/Render — frontend | Free-tier friendly |
 
---
 
## Core design decisions
 
- **Paste is the source of truth.** Emails never create entries — they only annotate ones that already exist.
- **Every record is user-scoped.** An EF Core global query filter on `Application.UserId` makes it structurally impossible to leak one user's data into another's query.
- **The pipeline has terminal states.** `Rejected`, `Offer Accepted`, `Offer Declined`, `Withdrawn`, `Archived` — otherwise the board fills up forever.
- **Automation is human-confirmed.** n8n proposes an email match; nothing gets attached to an application without a click.
---
 
## Status pipeline
 
```
Applied → Assessment Pending → Assessment Sent → Interview Scheduled → Offered
                                                          │
                    ┌─────────────────────────────────────┼─────────────────────────┐
                    ▼                                      ▼                         ▼
                Rejected                            Offer Accepted            Offer Declined
```
 
`Interview Scheduled` repeats across rounds without creating a new status — each round is a stage-detail record. `Archived` catches anything gone quiet 60+ days.
 
---
 
## Screenshots
 
| Board | Skills Gap | Email Match |
|---|---|---|
| `<screenshot>` | `<screenshot>` | `<screenshot>` |
 
---
 
## Project structure
 
```
JobTracker/
├── client/                 React (Vite)
│   ├── src/
│   │   ├── auth/            AuthContext, login
│   │   ├── components/      Sidebar, Layout, route guards
│   │   └── pages/            Board, Skills Gap, Settings, admin views
│   └── ...
└── JobTracker.Api/         .NET 8 Web API
    ├── Controllers/         Auth, Applications, Internal (n8n-facing)
    ├── Data/                 DbContext, tenant query filter
    ├── Models/                Application, StageDetail, TimelineEvent, Skill
    └── Services/              JWT token issuing
```
 
---
 
## Running locally
 
### API
```
cd JobTracker.Api
dotnet user-secrets set "ConnectionStrings:Default" "<your Supabase session-pooler string>"
dotnet ef database update
dotnet run
```
 
### Client
```
cd client
npm install
npm run dev
```
 
Set `VITE_API_URL` in `client/.env.local` to the API's local URL. CORS on the API is locked to `http://localhost:5173` by default — update `Cors:Origin` if you run Vite on a different port.
 
---
 
## Roadmap
 
- [x] JWT auth, tenant-isolated `Applications`
- [ ] Kanban board with drag-and-drop
- [ ] Stage detail forms + timeline
- [ ] Skills Gap chart
- [ ] n8n: skill extraction, email match, stale nudges, weekly digest
- [ ] Deploy (API + frontend + CI/CD)
**Stretch:** resume-paste skill extraction, a "track this job" browser extension, AI-generated interview prep questions per round, a public read-only share link.
 
---
 
## Challenges
 
- **Multi-user isolation** — enforced at the EF Core level via a global query filter tied to the JWT's user claim, rather than remembering to filter every query by hand.
- **Email fuzzy-matching accuracy** — LLM-proposed matches are never auto-applied; the user always confirms or rejects in the UI.
- **Free-tier cold starts** — the hosted API sleeps after 15 minutes idle; scheduled n8n calls and the first request after a lull eat a 30–60s wake-up cost.
---
