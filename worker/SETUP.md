# Worker setup (Trigger.dev)

The `worker/` package hosts cron-based background jobs:
- `hello-world` — smoke test job (this guide deploys it as proof)
- `agent-wake` — per-agent runtime tick (cron set dynamically per agent)
- `weekly-performance-fee` — Sun 23:59 UTC, 5% of weekly PnL → SAW treasury
- `daily-aum-fee` — daily 23:55 UTC, 1% APY pro-rated → SAW treasury

Today the agent loop runs via `cron-job.org` → `/api/cron/wake-due-agents` as a stopgap. This guide moves it to Trigger.dev v3, which gives us retries, dead-letter queue, per-job observability, and a real dashboard.

## One-time setup (Juan does this)

### 1. Create a Trigger.dev account

1. Go to https://cloud.trigger.dev → Sign up with GitHub (use the `asastuai` org if possible — keeps everything under one roof).
2. After signup you land in the dashboard.

### 2. Create a project

1. Click "New Project" → name it `saw` (or `saw-worker`).
2. Select region: pick the one closest to Vercel (US East / iad1 is the safe default).
3. Trigger.dev shows a "Project ref" string like `proj_xxxxxxxxxxxx`. **Copy it.**

### 3. Get the secret key

1. In the project sidebar → Settings → API keys.
2. There are two keys per environment: **Dev** and **Prod**.
3. Copy the **dev** secret key (starts with `tr_dev_…`). We use prod later.

### 4. Add env vars

Add to `worker/.env` (create if missing — already gitignored):

```bash
TRIGGER_PROJECT_REF=proj_xxxxxxxxxxxx
TRIGGER_SECRET_KEY=tr_dev_xxxxxxxxxxxx

# These should already exist for the agent-wake job:
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

For the prod deploy later we'll add `TRIGGER_SECRET_KEY` (the `tr_prod_…` one) to the prod env in the Trigger.dev dashboard, not in this file.

### 5. Tell me when done

Ping me with "trigger.dev ready" and I run:

```bash
cd worker
pnpm install                # (already done if you've worked here before)
npx trigger.dev@latest login   # one-time browser auth, links CLI to your account
pnpm dev                       # starts local dev — registers tasks against Dev env
```

`pnpm dev` should print something like:

```
[trigger.dev] Connected to project proj_xxxxxxxxxxxx
[trigger.dev] Registered task: hello-world
[trigger.dev] Registered task: agent-wake
[trigger.dev] Registered task: weekly-performance-fee
[trigger.dev] Registered task: daily-aum-fee
```

### 6. Smoke test from dashboard

1. In the Trigger.dev dashboard → Tasks → click `hello-world`.
2. Click "Test task" → paste `{ "name": "Juan" }` as the payload.
3. Hit "Run task". You should see:
   - State: COMPLETED
   - Output: `{ "greeting": "hello, Juan", "ranAt": "…", "runId": "…" }`
   - Logs: a "hello-world fired" entry with the name and runId.

If that works, the wiring is correct and we can flip the agent-wake cron from cron-job.org to Trigger.dev's dynamic schedules.

### 7. Deploy to prod

When the dev smoke passes:

```bash
pnpm deploy   # equivalent to: npx trigger.dev@latest deploy
```

This bundles all tasks under `src/jobs/` and pushes them to Trigger.dev's prod environment. The dashboard shows the new version under "Deployments" → click "Promote" to make it live.

## Troubleshooting

**`pnpm dev` says "no project ref"** → `.env` not loaded. Check `worker/.env` exists and has `TRIGGER_PROJECT_REF`.

**`Failed to authenticate`** → run `npx trigger.dev@latest login` first.

**`Cannot find module @trigger.dev/sdk/v3`** → `pnpm install` inside `worker/`.

**Task doesn't appear in dashboard** → make sure the file under `src/jobs/` actually `export`s the task constant. Trigger.dev scans exported `task(...)` / `schedules.task(...)` calls.
