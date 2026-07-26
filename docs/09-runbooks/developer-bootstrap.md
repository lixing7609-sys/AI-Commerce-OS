# Developer Bootstrap

Version

1.0

Date

2026-07-26

Status

Implemented

Scope

The one-command daily startup workflow for AI Commerce OS local development, after a Mac
restart or any time you sit down to work on this repo.

---

## 1. Purpose

Before this existed, starting a work session meant remembering, in order: which directory to
`cd` into, whether Postgres was running, whether to run Alembic migrations, how to start the
frontend dev server, which of the three edition URLs to open, and how to get a test watcher and
Claude Code running alongside it — all by hand, every time. `npm run bootstrap` now does the
whole sequence, is safe to re-run, and never touches Git history or kills a process it did not
start itself.

## 2. Supported environment

macOS only (uses `osascript` to drive Terminal.app). Requires, at minimum, Node.js, npm, and Git.
`uv` is required only if you want the backend to start (it manages the Python environment); the
frontend and the rest of the bootstrap work without it. Docker is optional and only used for
this repo's existing Postgres/n8n/Ollama containers if you already run them — the bootstrap never
creates, starts, or stops Docker containers itself, since there is no `docker-compose.yml` in
this repository to define how.

## 3. Prerequisites (first-time setup)

1. Clone the repo and `cd` into it.
2. `cd frontend && npm install` (the bootstrap will also do this automatically on first run if
   `node_modules` is missing, but you can do it manually too).
3. If you want the backend to run: have Postgres reachable at `localhost:5432` (this repo's
   `backend/app/database/db.py` hardcodes `postgresql+psycopg://n8n:password123@localhost:5432/ai_commerce_os`
   — no override via environment variable exists today). This repo's own development setup runs
   Postgres via an existing Docker container (`docker ps` shows a container named `postgres`);
   the bootstrap detects whether it's reachable but does not start it for you.
4. Install `uv` (`brew install uv`) if you want the backend to start.
5. Optional: install the `claude` CLI if you want Terminal 4 to launch it automatically.

## 4. Daily startup

```bash
npm run bootstrap
```

Run this from the repository root. It will:

1. Print prerequisite status (Node/npm/Git/uv/Python/Docker/Claude Code — missing *required*
   tools stop the script with clear guidance; missing *optional* tools just print a note).
2. Print Git safety state: current branch, last 5 commits, and a warning (not a block) if the
   working tree is dirty. It never runs `git pull`, `checkout`, `reset`, `stash`, `commit`,
   `push`, or `rebase`.
3. Run `npm ci` in `frontend/` only if `node_modules` is missing — never touches the lockfile
   otherwise, never upgrades dependencies.
4. Start the frontend dev server on port 5173 (skipped if something is already listening there —
   reused instead of duplicated).
5. Start the backend on port 8000 **only if Postgres is reachable at `localhost:5432`** — runs
   `uv run alembic upgrade head` first, then `uv run uvicorn app.main:app --reload`. If Postgres
   isn't reachable, it prints why and continues without the backend; Founder modules that call
   the backend already degrade to a visible "backend unavailable" state rather than crashing.
6. Start a Vitest watch process for the frontend test suite.
7. Wait for the frontend to respond, then open four Terminal tabs (or windows, if your Mac
   hasn't granted Accessibility permission for tab creation — see §8) and the three edition URLs
   in your browser.

## 5. The four-terminal workflow

| Terminal | Content |
|---|---|
| 1 | Tails the frontend (and backend, if running) logs |
| 2 | Tails the Vitest watch output |
| 3 | Prints `git status` + `git log --oneline -5` once, then drops into a normal interactive shell in the repo root — use it for your everyday `git` commands |
| 4 | `cd` into the repo and launches the `claude` CLI (skipped with `--no-claude`, or if `claude` isn't installed) |

## 6. URLs opened

- Cloud (default): `http://localhost:5173/`
- Operator: `http://localhost:5173/?mode=operator-preview`
- Founder: `http://localhost:5173/?mode=founder&module=secretary`

Browser tabs are only opened once per bootstrap session (tracked via
`.runtime/dev-bootstrap/session.json`) — re-running `npm run bootstrap` while already running
will not spawn duplicate browser tabs.

## 7. Other commands

```bash
npm run bootstrap -- --dry-run    # print the plan, start nothing, open nothing
npm run bootstrap:status          # report what's currently running, safe with nothing running
npm run bootstrap:stop            # stop only what this bootstrap started
```

Useful flags on the main command: `--no-browser` (skip opening browser tabs), `--no-claude`
(skip launching Claude Code in Terminal 4 — useful if you're already running this bootstrap from
inside a Claude Code session and don't want to launch a second, nested one).

## 8. Port conflicts and Terminal tabs vs. windows

If port 5173 or 8000 is already in use by something the bootstrap didn't start, it reuses it
(logs "already listening — reusing") rather than failing or starting a duplicate.

Opening four **tabs** in one Terminal window requires macOS Accessibility permission for
Terminal/osascript to send the ⌘T keystroke (System Settings → Privacy & Security →
Accessibility). Without that permission, `developer-bootstrap-terminal.applescript` automatically
falls back to opening four separate **windows** instead — the bootstrap still fully succeeds,
just with a different window layout.

## 9. Backend-unavailable behavior

If Postgres isn't reachable, the backend is simply not started — this is expected and safe, not
an error state you need to fix before working on the frontend. Founder modules that depend on the
backend (Store Center, System Center's runtime panel) already show a visible degraded state
("店铺数据加载失败" / "已安全降级") instead of crashing; see
[edition-architecture.md](../01-reference-architecture/edition-architecture.md) and
[agent-evolution-foundation.md](../01-reference-architecture/agent-evolution-foundation.md) for
how the three editions handle mock-vs-real data generally.

## 10. Git safety

The bootstrap **never** runs `git pull`, `checkout`, `reset`, `stash`, `commit`, `push`, `-f`
force operations, or `rebase`, under any flag or condition. A dirty working tree only produces a
printed warning in the startup output — never automatic cleanup.

## 11. Runtime directory, logs, and PID files

Everything the bootstrap writes lives under `.runtime/dev-bootstrap/` (gitignored, never
committed):

```
.runtime/dev-bootstrap/
  frontend.pid  backend.pid  testwatch.pid   # PID files, used for idempotency and `stop`
  session.json                               # marks that browser tabs were already opened
  logs/
    frontend.log  backend.log  testwatch.log
```

`npm run bootstrap:stop` only ever stops a process whose PID is recorded in one of these files
and is confirmed still alive (`kill -0`) — it never uses `pkill`/`killall` or any command that
could match a process it didn't start.

## 12. Troubleshooting

- **"one or more required prerequisites are missing"** — install the tool named `[MISSING,
  required]` in the printed list, then re-run.
- **Backend never starts** — run `npm run bootstrap:status`; if it says Postgres isn't reachable
  at `localhost:5432`, start your Postgres container/service and re-run `npm run bootstrap`.
- **`alembic upgrade head` fails** — the bootstrap prints the failure and continues without
  starting the backend; run it manually from `backend/` with `uv run alembic upgrade head` to see
  the full error.
- **Terminal tabs open as separate windows instead** — see §8; this is the expected fallback when
  Accessibility permission hasn't been granted, not a bug.
- **Want to fully reset and start clean** — `npm run bootstrap:stop`, then delete
  `.runtime/dev-bootstrap/session.json` if you specifically want fresh browser tabs on the next
  run (deleting the whole `.runtime/dev-bootstrap/` directory is also safe; it will be recreated).

## 13. Validating the bootstrap itself

```bash
bash scripts/developer-bootstrap-selftest.sh
```

Non-destructive: checks the scripts exist, have valid syntax and executable permissions, that no
destructive Git command or broad process-kill exists anywhere in them, that dry-run starts
nothing, and that `status`/`stop` are safe with nothing running. Does not open Terminal windows
or launch Claude Code.
