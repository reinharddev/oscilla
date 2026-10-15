# Oscilla

Predictive-maintenance workspace for warehouse fleets. It watches the vibration of forklifts, AGVs and drones, turns it into a health score with the evidence behind it, and lets technicians ask a **Maintenance Copilot** what is wrong and what to do next. Everything the AI says is checked against the data before it is shown.

Built for the AMD Developer Hackathon: ACT III, track **Intelligent Industry** (team Welcome World). The working name is provisional.

> **Read this first: what is real and what is simulated.**
> There are no physical sensors in this project. Vibration signals come from a synthetic bearing-fault generator. The signal processing (RMS, kurtosis, FFT bands, envelope analysis at the bearing defect frequency), the scoring against each machine's own healthy baseline, the retrieval, the guardrails, the database and the permission model are real code. The service manuals in `knowledge/` are **synthetic samples**, not vendor documents. Scores have not been validated on field data.

## What it does

- **Machine health view.** Every monitored machine in one table, worst first: status, score, estimated remaining life and next service. Selecting a machine shows the evidence behind the score, companion channels, a per-machine journal and the Copilot.
- **Maintenance overview.** Machines monitored, machines needing attention, average score, open and overdue work orders, work completed in 30 days, and how often technicians confirmed the AI's diagnosis. All computed from the database.
- **Maintenance Copilot.** Explains the likely cause from signal evidence, manual excerpts and the journal. It cites its sources, states a qualitative confidence, and always asks for human review when a machine is critical.
- **Question-answer agent.** Answers fleet questions by calling typed tools (health, schedule, journal, work orders). It can only propose changes; a person confirms them.
- **Work orders and feedback.** A Copilot recommendation becomes a work order with the AI diagnosis attached; the technician later marks the diagnosis correct or incorrect.
- **Four roles, four working screens.** The same database rules apply to everyone; what differs is the job each role sees:
  - *Technician:* **My tasks** (assigned work, unassigned work to take, machines to watch) and the machine screen.
  - *Manager:* **Overview**, **Work orders** (assign technicians of the warehouse), **Audit log**, **Data sources**.
  - *Admin:* all of that plus **Organization** (every warehouse side by side) and **People** (roles).
  - *Viewer:* **Overview** and machines, read-only, with no action buttons.
  The database enforces the same boundaries with row-level security. Assignment has its own guard: a technician can only take a task for themselves, a manager can assign anyone who works in that warehouse.
- **English and Indonesian UI**, switchable at any time.
- **Guided demo.** The "Demo" button walks one machine from healthy to worn to repaired in seven steps (dummy-sensor mode only).

## Loading and request budget

The dashboard is a client-rendered single-page app. `/app` is a thin shell that paints immediately; the browser then makes one call to `/api/bootstrap` and shows skeletons until it returns. Moving between screens and switching warehouse does not reload the page.

Requests to the database are kept low on purpose:

- The session token is verified locally against the project's signing keys (`getClaims`), so a request costs no call to the auth server.
- The latest readings of every machine come from one RPC (`health_history`), not one query per machine.
- The dummy sensors claim their due readings in one statement (`claim_sim_ticks`), read all baselines in one query and insert all readings in one request: three requests per round, however many machines are due.
- The browser refreshes every 30 s while the tab is visible and catches up when it becomes visible again.

## How data gets in

Readings reach the system the way they would in production, and the screens only read what is stored:

```
gateway / sensor ──POST /api/ingest──► score against the machine's baseline ──► health_snapshots ──► UI, Copilot, agent
dummy sensors (SIM_ENABLED=true) ────────────────┘   (same scoring and storage path)
```

- **Real gateways** send one window of raw vibration samples per machine to `POST /api/ingest` (header `x-ingest-key`). A machine's healthy baseline is learned from 5-200 healthy windows sent to `POST /api/ingest/baseline` and stored in the database, so the health service holds no state.
- **Dummy sensors** are the only difference in this deployment. A simulator on the server produces vibration windows at each machine's current damage level, with slow wear over time, and pushes them through the same scoring and storage. A finished work order resets the machine to a healthy level, as a repair would. `npm run seed:sim` creates 30 days of history through the real pipeline.
- **Trend.** Remaining life comes from the slope of stored scores, not from a stored guess; flat or improving trends show no estimate.
- Set `SIM_ENABLED=false` when real gateways are connected.

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

**AMD Token Factory (shared, free during the event).** Token Factory exposes OpenAI-compatible endpoints served on AMD GPUs. Point the app at it with:

```
LLM_BASE_URL=https://developer.amd.com.cn/radeon/api/v1
LLM_API_KEY=rc-...                 # team key, kept in .env.local only
LLM_MODEL=DeepSeek-V4-Flash        # call GET /v1/models for the current list
LLM_REASONING_EFFORT=              # empty for non-thinking models; low or medium for thinking ones
```

`npm run check:llm` lists the models, makes one chat call and prints latency and token counts without showing the key. The client sends only fields the gateway accepts, uses a single system message, and retries a short concurrency 429 once. The key is shared (the usage page for our team key shows 20 requests per minute, and a small daily spend cap), so the server keeps its own budget (`LLM_MAX_RPM`, default 15 per minute) and caches a Copilot answer for a minute per user, machine and data snapshot. When the budget or the provider limit is hit, the Copilot and agent fall back to their template and rule-based modes and say why, instead of failing. Prompts sent contain only synthetic demo data; the endpoint logs prompts for about two days.

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
node --env-file=.env.local scripts/seed-demo-users.mjs      # needs SUPABASE_SECRET_KEY and DEMO_PASSWORD
npm run seed:sim                  # dummy-sensor state and 30 days of history (health service must be running)

npm run dev:health                # terminal 1, port 8100
npm run dev                       # terminal 2, port 3000
```

Open <http://localhost:3000>: the landing page is public, the dashboard is at `/app` and needs a sign-in. The demo accounts are `admin@`, `manager@`, `technician@`, `viewer@` and `technician.sby@oscilla.example`; the shared password is whatever you set as `DEMO_PASSWORD`.

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
| `SIM_ENABLED`, `SIM_TICK_MS` | web | Dummy sensors on or off (default on) and how often each machine reports (default 30 s) |
| `INGEST_API_KEY` | web | Shared secret for gateways calling `/api/ingest`; empty disables ingest |

Never commit `.env` or `.env.local`; both are git-ignored.

## Tests

```bash
npm test                # health service (pytest), RLS policies (PGlite), Copilot, agent, ingest helpers, i18n
npm run test:remote     # isolation checks against the real Supabase project (needs .env.local)
npx tsc --noEmit
```

The RLS tests run the real migration in an in-process Postgres and check what each role can read and write across warehouses.

## Validation on real data (CWRU)

The scoring was checked on real bearing recordings from the Case Western Reserve University Bearing Data Center (12 kHz drive-end accelerometer, 0 hp, about 1797 rpm): one normal recording and nine fault recordings (inner race, ball and outer race, each at 0.007", 0.014" and 0.021"). The unchanged production code was used and **nothing was tuned on CWRU**; the scoring constants come from the synthetic windows. The baseline is learned from the first half of the normal recording and the second half is held out.

| Result | Value |
|---|---|
| Held-out normal windows scored below 75 (false alarms) | 0 of 10 |
| Fault recordings with every 1 s window below 75 and below 50 | 9 of 9 (10 windows each) |
| Median score per fault recording | 8 to 36 (normal: 99) |
| AUROC, fault vs held-out normal | 1.0 in all nine |

Reproduce it (the data files are not in the repository; download them from the CWRU site into `health-service/data/cwru/`, file numbers are listed in `health-service/validation/cwru.py`):

```bash
npm run validate:cwru
```

How to read this honestly:

- **It is an easy test.** Faults at 0 hp against a normal recording at the same load separate cleanly. Detection is driven mostly by energy in the 2-4 kHz band, where the bearing impacts ring; the envelope ratio at the outer-race defect frequency rises strongly only for the outer-race recordings, as expected.
- **Small sample.** 10 windows per recording. Treat the perfect AUROC as "clearly separable here", not as a field accuracy figure.
- **Not yet tested:** normal recordings at other loads (a likely source of false alarms), other machines, noisy field conditions.
- **Detection only.** The score says that something is abnormal; it does not tell inner race, outer race and ball faults apart.
- **Severity ordering is not expected to hold.** The CWRU fault sizes come from different seeded-fault bearings, not from one bearing wearing down, so a larger fault does not always score lower. Remaining-life estimates are not validated: CWRU has no run-to-failure data (the IMS dataset does).

## Known limitations

- The live demo telemetry is synthetic. The scoring has been checked on CWRU recordings (see above) but not on field data; the IMS run-to-failure dataset is the planned check for remaining-life estimates.
- Manuals are synthetic samples written for this demo.
- Dummy sensors report when someone is using the app or asking the Copilot (a serverless host has no background process). Real gateways report on their own through `/api/ingest`.
- The ingest key is one shared secret per deployment; per-gateway keys and rate limiting are not built.
- Raw windows are scored and discarded; only features, score and evidence are stored.
- The companion channels (velocity, temperature, current) are dummy values next to the scored vibration window and do not feed the score.
- Work orders are internal. There is no CMMS or ERP integration yet.
- The KPI-style numbers shown are computed from stored work orders and readings; the sample data set is small.
