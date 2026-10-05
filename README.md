# Oscilla

Predictive-maintenance workspace for warehouse fleets. It watches the vibration of forklifts, AGVs and drones, turns it into a health score with the evidence behind it, and lets technicians ask a **Maintenance Copilot** what is wrong and what to do next. Everything the AI says is checked against the data before it is shown.

Built for the AMD Developer Hackathon: ACT III, track **Intelligent Industry** (team Welcome World). The working name is provisional.

> **Read this first: what is real and what is simulated.**
> There are no physical sensors in this project. Vibration signals come from a synthetic bearing-fault generator. The signal processing (RMS, kurtosis, FFT bands, envelope analysis at the bearing defect frequency), the scoring against each machine's own healthy baseline, the retrieval, the guardrails, the database and the permission model are real code. The service manuals in `knowledge/` are **synthetic samples**, not vendor documents. Scores have not been validated on field data.

## What it does

- **Fleet view.** An isometric 3D warehouse (one layout per site) next to operational panels: KPIs, zones, orders, fleet status, maintenance schedule.
- **Machine health.** Per machine: health score, remaining-life estimate, the vibration features that moved away from baseline, and a per-machine service journal.
- **Maintenance Copilot.** Explains the likely cause from signal evidence, manual excerpts and the journal. It cites its sources, states a qualitative confidence, and always asks for human review when a machine is critical.
- **Question-answer agent.** Answers fleet questions by calling typed tools (health, schedule, journal, work orders). It can only propose changes; a person confirms them.
- **Work orders and feedback.** A Copilot recommendation becomes a work order with the AI diagnosis attached; the technician later marks the diagnosis correct or incorrect.
- **Multiple warehouses, four roles.** `admin`, `manager`, `technician`, `viewer`, enforced in the database (row-level security), not only in the UI.
- **English and Indonesian UI**, switchable at any time.
- **Guided demo.** The "Demo" button walks one machine from healthy to worn to repaired in seven steps.

## Architecture

```
Browser ── Next.js 16 (app + API routes) ──┬── Supabase (Postgres + Auth, RLS)
                                           ├── Health service (FastAPI): features + scoring
                                           └── LLM endpoint (OpenAI-compatible, vLLM on AMD)
```

| Part | Where | Notes |
|---|---|---|
| Web app | `app/`, `components/`, `lib/` | Next.js 16, React 19, React Three Fiber, Tailwind v4, zustand |
| Health service | `health-service/` | Python 3.12, NumPy/SciPy, FastAPI. Stateless; optional `X-API-Key` |
| Copilot | `lib/copilot/`, `app/api/copilot/` | BM25 retrieval over `knowledge/manuals.json`, prompt, guardrails, template fallback |
| Agent | `lib/agent/`, `app/api/agent/` | Tool registry (zod schemas), tool-calling loop, rule-based planner when no LLM |
| Database | `supabase/` | One migration, seed data, per-warehouse layouts as JSON |

### How the AI is kept honest

- Facts are loaded **under the caller's own permissions**. A machine the user cannot see simply does not exist for the Copilot or the agent.
- Citations must refer to retrieved sources. Numbers and durations in the answer must come from the facts or the sources.
- A critical machine **always** gets a human-review flag.
- An answer that fails these checks is rejected and replaced by a deterministic template; the rejected text stays viewable.
- The agent's backend interface has **no write methods**. Changes are proposals that a person confirms in the UI.
- Prompt-injection cases are covered by tests (`lib/agent/agent.test.ts`).
- Confidence is qualitative and **not calibrated**.

### Where AMD is used

The LLM behind the Copilot and the agent is any OpenAI-compatible endpoint. The intended deployment serves an open model with **vLLM on an AMD Instinct MI300X (ROCm)** from the AMD Developer Cloud, and the app is pointed at it with `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL`. The health-service image is a CPU image today; the interface is plain HTTP so a ROCm/PyTorch model can replace the scoring later without touching the web app.

Without an LLM endpoint the app still works: the Copilot returns its template answer and the agent uses its rule-based planner. Both are labelled as such in the UI.

## Run it locally

Requirements: Node 24, Python 3.12, a Supabase project (the free plan is enough).

```bash
cp .env.example .env.local        # fill in your Supabase URL and keys
npm install
python3 -m venv health-service/.venv
health-service/.venv/bin/pip install -r health-service/requirements.txt

# once per Supabase project
supabase link --project-ref <ref> && supabase db push
node --env-file=.env.local scripts/seed-layouts.mjs
node --env-file=.env.local scripts/seed-demo-users.mjs      # needs SUPABASE_SECRET_KEY and DEMO_PASSWORD

npm run dev:health                # terminal 1, port 8100
npm run dev                       # terminal 2, port 3000
```

Open <http://localhost:3000>. The demo accounts are `admin@`, `manager@`, `technician@`, `viewer@` and `technician.sby@oscilla.example`; the shared password is whatever you set as `DEMO_PASSWORD`.

To try the Copilot and agent without a GPU, run the mock LLM (`npm run mock:llm`, port 8199) and set `LLM_BASE_URL=http://localhost:8199/v1`. Start it with `MOCK_MODE=liar` to watch the guardrails reject a bad answer.

## Run it with Docker

```bash
cp .env.example .env              # same values as above
docker compose up --build         # web on :3000, health service on :8100
docker compose --profile mock up  # additionally a mock LLM on :8000 (set LLM_BASE_URL=http://mock-llm:8000/v1)
```

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are compiled into the browser bundle, so they are build arguments; the compose file passes them for you. Supabase itself stays hosted. The secret key is read at runtime and is never sent to the browser.

## Configuration

| Variable | Needed by | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | web (build) | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | web (build) | Public client key; access is limited by RLS |
| `SUPABASE_SECRET_KEY` | web (runtime), scripts | Server only. Stores health snapshots; creates demo users |
| `HEALTH_SERVICE_URL` | web | Default `http://localhost:8100` |
| `HEALTH_SERVICE_KEY` | web, health service | Optional shared secret (`HEALTH_API_KEY` on the service) |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | web | OpenAI-compatible endpoint. Empty means template and rule-based mode |
| `DEMO_PASSWORD` | scripts | Password for the seeded demo accounts |

Never commit `.env` or `.env.local`; both are git-ignored.

## Tests

```bash
npm test                # health service (pytest), RLS policies (PGlite), layouts, Copilot, agent, i18n
npm run test:remote     # isolation checks against the real Supabase project (needs .env.local)
npx tsc --noEmit
```

The RLS tests run the real migration in an in-process Postgres and check what each role can read and write across warehouses.

## Known limitations

- Telemetry is synthetic; no field validation yet. A public bearing dataset (CWRU or IMS) is the planned next check.
- Manuals are synthetic samples written for this demo.
- Health snapshots are written only while someone has the app open and visible. A production deployment needs a proper ingest service.
- Baselines in the health service are held in memory.
- The 3D scene uses primitive shapes only; there is no low-graphics mode yet.
- No CMMS or ERP integration, no real sensor ingest API yet.
