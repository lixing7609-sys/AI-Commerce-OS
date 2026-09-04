# Developer Bootstrap

Version

2.0

Date

2026-07-26

Status

Implemented

Scope

The one-command daily startup workflow for AI Commerce OS local development, after a Mac
restart, a Terminal close, or any time you sit down to work on this repo — including via the
`AI Commerce OS Launcher.app` bundle at the repo root.

---

## 1. Purpose

Before this existed, starting a work session meant remembering, in order: which directory to
`cd` into, whether Postgres was running, whether to run Alembic migrations, how to start the
frontend dev server, which of the three edition URLs to open, and how to get a test watcher and
Claude Code running alongside it — all by hand, every time. `npm run bootstrap` now does the
whole sequence, is safe to re-run, and never touches Git history or kills a process it did not
start itself.

**Version 2.0 change:** services are now supervised by macOS `launchd` (per-user LaunchAgents,
`gui/$UID` domain — no `sudo`, no system daemon) instead of plain `nohup`-backgrounded processes.
This was a deliberate redesign after a real failure: a `nohup ... &` job spawned from a single
tool-driven shell session was confirmed to *not* reliably survive independent of the session that
started it in every environment. `launchd` is macOS's own init system — once a job is registered
with `launchctl bootstrap`, it survives Terminal closing, the initiating shell/session ending, and
even auto-restarts on crash (`KeepAlive`), independent of who started it. `launchctl bootout`
cleanly and fully reverses it; nothing here is a privileged or global installation.

## 2. Supported environment

macOS only (uses `launchctl` for service supervision and `osascript` to drive Terminal.app for the
optional four-tab layout). Requires, at minimum, Node.js, npm, Git, and `launchctl` (always
present on macOS). `uv` is required only if you want the backend to start (it manages the Python
environment); the frontend and the rest of the bootstrap work without it. Docker is optional and
only used for this repo's existing Postgres/n8n/Ollama containers if you already run them — the
bootstrap never creates, starts, or stops Docker containers itself, since there is no
`docker-compose.yml` in this repository to define how.

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

Run this from the repository root (or double-click `AI Commerce OS Launcher.app` — see §14). It
will:

1. Print prerequisite status (Node/npm/Git/uv/Python/Docker/`launchctl`/Claude Code — missing
   *required* tools stop the script with clear guidance; missing *optional* tools just print a
   note).
2. Print Git safety state: current branch, last 5 commits, and a warning (not a block) if the
   working tree is dirty. It never runs `git pull`, `checkout`, `reset`, `stash`, `commit`,
   `push`, or `rebase`.
3. Run `npm ci` in `frontend/` only if `node_modules` is missing — never touches the lockfile
   otherwise, never upgrades dependencies.
4. Compute each service's real state (see §5) and either reuse it, reuse an externally-owned one,
   or register + start a fresh `launchd` job for it — for the frontend (port 5173), backend (port
   8000, only if Postgres is reachable), and a Vitest watch process.
5. Wait for the frontend to actually answer HTTP (not just "port is listening"), then open four
   Terminal tabs (or windows, if your Mac hasn't granted Accessibility permission for tab creation
   — see §9) and the three edition URLs in your browser — skipped on a repeat run within the same
   session (see §7).

## 5. Service state machine and ownership

`bootstrap:status` and `bootstrap.sh` both compute one of six states per service:

| State | Meaning |
|---|---|
| `RUNNING` | launchd job loaded, process alive, port listening, HTTP health check passes |
| `STARTING` | launchd job loaded, process alive, but port not listening yet |
| `UNHEALTHY` | launchd job loaded, port listening, but the HTTP health check fails |
| `STALE` | launchd job loaded but no live process (rare — between crash and `KeepAlive` restart) |
| `EXTERNAL` | nothing loaded under our launchd label, but the port is occupied by something else (e.g. you started it by hand) |
| `STOPPED` | nothing loaded, port free |

Ownership follows directly: `RUNNING`/`STARTING`/`UNHEALTHY`/`STALE` are all "bootstrap-owned"
(re-running bootstrap reuses them, never starts a duplicate); `EXTERNAL` is reused for the current
session but left unsupervised (bootstrap will not stop it, and it won't auto-restart on crash);
`STOPPED` is where a fresh launchd job gets registered and started.

## 6. The four-terminal workflow

| Terminal | Content |
|---|---|
| 1 | Tails the frontend (and backend, if running) logs |
| 2 | Tails the Vitest watch output |
| 3 | Prints `git status` + `git log --oneline -5` once, then drops into a normal interactive shell in the repo root — use it for your everyday `git` commands |
| 4 | `cd` into the repo and launches the `claude` CLI (skipped with `--no-claude`, or if `claude` isn't installed) |

This layout is purely a convenience — closing these Terminal windows, or the whole Terminal app,
has **zero effect** on the actual services, since they run as independent `launchd` jobs (verify
with `ps -o ppid -p <pid>`: it reports `1`, i.e. `launchd`, not this Terminal's shell).

## 7. URLs opened

- Cloud (default): `http://localhost:5173/`
- Operator: `http://localhost:5173/?mode=operator-preview`
- Founder: `http://localhost:5173/?mode=founder&module=secretary`

Browser tabs and the four-terminal layout are only opened once per bootstrap session (tracked via
`.runtime/dev-bootstrap/session.json`) — re-running `npm run bootstrap` while already running will
not spawn duplicate browser tabs or duplicate Terminal windows. Delete that file, or run
`npm run bootstrap:stop` (which removes it), if you want a fresh layout on the next run.

## 8. Other commands

```bash
npm run bootstrap -- --dry-run    # print the plan, start nothing, open nothing
npm run bootstrap:status          # report what's currently running, safe with nothing running
npm run bootstrap:stop            # stop only what this bootstrap started (launchctl bootout)
npm run bootstrap:restart         # stop then bootstrap again — same canonical entrypoints, no separate logic
npm run launcher:test             # self-test for AI Commerce OS Launcher.app — see §14
```

Useful flags on the main command: `--no-browser` (skip opening browser tabs), `--no-claude`
(skip launching Claude Code in Terminal 4 — useful if you're already running this bootstrap from
inside a Claude Code session and don't want to launch a second, nested one).

## 9. Port conflicts and Terminal tabs vs. windows

If port 5173 or 8000 is already in use by something the bootstrap didn't start, it reuses it
(`EXTERNAL` state, logs "not bootstrap-owned — reusing") rather than failing or starting a
duplicate.

Opening four **tabs** in one Terminal window requires macOS Accessibility permission for
Terminal/osascript to send the ⌘T keystroke (System Settings → Privacy & Security →
Accessibility). Without that permission, `developer-bootstrap-terminal.applescript` automatically
falls back to opening four separate **windows** instead — the bootstrap still fully succeeds,
just with a different window layout.

## 10. Backend-unavailable behavior

If Postgres isn't reachable, the backend is simply not started — this is expected and safe, not
an error state you need to fix before working on the frontend. Founder modules that depend on the
backend (Store Center, System Center's runtime panel) already show a visible degraded state
("店铺数据加载失败" / "已安全降级") instead of crashing; see
[edition-architecture.md](../01-reference-architecture/edition-architecture.md) and
[agent-evolution-foundation.md](../01-reference-architecture/agent-evolution-foundation.md) for
how the three editions handle mock-vs-real data generally.

## 11. Git safety

The bootstrap **never** runs `git pull`, `checkout`, `reset`, `stash`, `commit`, `push`, `-f`
force operations, or `rebase`, under any flag or condition. A dirty working tree only produces a
printed warning in the startup output — never automatic cleanup.

## 12. Runtime directory, logs, and launchd jobs

Everything the bootstrap writes lives under `.runtime/dev-bootstrap/` (gitignored, never
committed):

```
.runtime/dev-bootstrap/
  session.json                               # marks that browser tabs/Terminal layout were already opened
  launchd/
    com.aicommerceos.dev.frontend.plist       # generated launchd job definitions
    com.aicommerceos.dev.backend.plist
    com.aicommerceos.dev.testwatch.plist
  logs/
    frontend.log  backend.log  testwatch.log  launcher.log
```

The three launchd jobs are registered in the `gui/$UID` domain under labels
`com.aicommerceos.dev.frontend` / `.backend` / `.testwatch` — inspect any of them directly with:

```bash
launchctl print "gui/$(id -u)/com.aicommerceos.dev.frontend"
```

`npm run bootstrap:stop` only ever stops a job by one of these three labels via
`launchctl bootout` — it never uses `pkill`/`killall`/`sudo` or any command that could match a
process it didn't register itself. (Legacy PID files from the pre-2.0 `nohup` model are cleaned up
best-effort if found, but are not the primary mechanism.)

## 13. Troubleshooting

- **"one or more required prerequisites are missing"** — install the tool named `[MISSING,
  required]` in the printed list, then re-run.
- **Backend never starts** — run `npm run bootstrap:status`; if it says Postgres isn't reachable
  at `localhost:5432`, start your Postgres container/service and re-run `npm run bootstrap`.
- **`alembic upgrade head` fails** — the bootstrap prints the failure and continues without
  starting the backend; run it manually from `backend/` with `uv run alembic upgrade head` to see
  the full error.
- **Terminal tabs open as separate windows instead** — see §9; this is the expected fallback when
  Accessibility permission hasn't been granted, not a bug.
- **Status shows `STALE`** — the launchd job is loaded but has no live process right now (between
  a crash and `KeepAlive`'s automatic restart); re-run `npm run bootstrap:status` a moment later,
  or just re-run `npm run bootstrap` to force a fresh start.
- **Want to fully reset and start clean** — `npm run bootstrap:stop`, then delete
  `.runtime/dev-bootstrap/session.json` if you specifically want fresh browser tabs/Terminal
  layout on the next run (deleting the whole `.runtime/dev-bootstrap/` directory is also safe; it
  will be recreated, and any orphaned launchd job can be removed directly with
  `launchctl bootout "gui/$(id -u)/com.aicommerceos.dev.<frontend|backend|testwatch>"`).

## 14. AI Commerce OS Launcher.app

A double-clickable `.app` bundle at the repo root (`AI Commerce OS Launcher.app`) for starting
everything without opening a terminal manually. It is a thin wrapper — **it always runs the same
canonical `npm run bootstrap` command documented above; no separate startup logic lives in the
launcher.**

Behavior on launch:

1. Resolves and validates the repository path (checks for `package.json` and `scripts/` at the
   resolved location) before doing anything else; shows a visible error notification and exits if
   the check fails.
2. Attempts to open a Terminal window running `npm run bootstrap` with live progress. This
   requires one-time macOS Automation permission (System Settings → Privacy & Security →
   Automation → "AI Commerce OS Launcher" → Terminal) — a normal, by-design macOS security
   boundary for unsigned app bundles automating other apps, not a bug.
3. If that permission hasn't been granted (or fails for any other reason), it falls back
   automatically to running `npm run bootstrap -- --no-claude` headlessly — services still start
   either way; only the visible-progress Terminal window is skipped.
4. Waits up to 30s for the frontend to actually respond, then always ends with a **non-blocking**
   Notification Center banner reporting success or failure (never a blocking modal dialog — a
   modal `display alert` would require a click before the launcher can finish, which is both worse
   UX for a background launcher and would hang any automated verification of it).
5. Everything is logged to `.runtime/dev-bootstrap/logs/launcher.log`.

Safe to double-click more than once: since it always delegates to the same idempotent
`npm run bootstrap`, a second launch reuses already-running services rather than starting
duplicates.

**Validating the launcher itself:**

```bash
npm run launcher:test
```

This runs `scripts/developer-launcher-selftest.sh`, which checks the bundle's static structure and
behavior (calls the canonical bootstrap command, never calls `npm run dev`/`test:watch` directly,
uses non-blocking notifications, has a headless fallback, never uses `sudo` or a destructive Git
command), then performs a **live** invocation via `open <bundle.app>` — the same LaunchServices
code path Finder uses for a double-click — and observes the real result (log growth, frontend
readiness, notification).

**Honest limitation:** this environment cannot simulate an actual mouse double-click inside
Finder. `open` is the closest available equivalent, but it is not literally identical (Finder's
own error dialogs on a malformed bundle, Dock bounce animation, etc. are Finder-specific and not
exercised by `open`). If you have access to a normal interactive macOS GUI session, a real Finder
double-click test is still worth doing once; the self-test's own log output states this limitation
rather than claiming untested Finder behavior.

## 15. Validating the bootstrap itself

```bash
bash scripts/developer-bootstrap-selftest.sh
```

Non-destructive: checks the scripts exist, have valid syntax and executable permissions, that no
destructive Git command, `sudo`, or broad process-kill exists anywhere in them, that the launchd
domain is the per-user `gui/$UID` (never a system daemon), that duplicate-start protection and the
service state machine are in place, that health probing is real HTTP (not just "port is
listening"), that dry-run starts nothing, and that `status`/`stop` are safe with nothing running.
Does not open Terminal windows or launch Claude Code.

## 16. Operator advertising module (广告投放)

See [operator-advertising.md](./operator-advertising.md) for the Operator edition's advertising
operations module — a separate feature documented on its own, unrelated to process bootstrap.
