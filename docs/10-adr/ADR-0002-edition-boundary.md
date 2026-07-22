---
document_id: ADR-0002
title: Edition Boundary
status: Accepted
date: 2026-07-22
owner: Chief Software Architect
---

# ADR-0002 Edition Boundary

## Status

Accepted

---

## Context

AI Commerce OS is meant to become the basis for several distinct products built from the same
Core, rather than a single developer workspace that gets copied wholesale onto an operator's Mac
mini or forked into parallel codebases:

- A **Developer Edition** used only by the people building the system.
- An **Operator Edition** used by the business owner running their store day to day.
- A **Device Admin Edition** used by the person who installed and maintains the Mac mini on site.
- An **Operator Cloud** used by the platform operator to manage every customer, device and
  license.

Today the repository does not distinguish between any of these. There is one FastAPI backend
with no role or edition enforcement anywhere (`backend/app/main.py` mounts every router with no
guard), and one React frontend (`frontend/src/App.jsx` + `frontend/src/components/layout/
Sidebar.jsx`) whose navigation is entirely in developer/engineering vocabulary — Runtime, Task
Center, AI 员工 (Agent) debugging, Knowledge Base internals. Anyone who opens the app sees all of
it.

The one piece of prior art is `frontend/src/operator-preview/`: a client-only prototype, reached
via `?mode=operator-preview` in the URL, with its own Chinese business-language navigation
(`OPERATOR_NAV_ITEMS`) and a `FORBIDDEN_DEV_TERMS` guard (`frontend/src/operator-preview/helpers/
navigation.js`) that stops developer vocabulary from creeping back into its nav labels. It proves
the idea works at the UI layer, but it has no backend enforcement behind it — the full developer
API surface (Runtime start/stop, Task queue, Agent debug endpoints) is reachable regardless of
which frontend is loaded, and nothing about the current build process would stop the entire
developer app, source tree, tests and Git history from ending up on a customer's machine.

---

## Problem

How should the system be structured so that Developer, Operator, Device Admin and Operator Cloud
each get a surface appropriate to who they are and where they run, without duplicating business
logic across editions, without shipping the whole engineering workspace to a customer's Mac mini,
and without relying on the frontend simply hiding menu items as the only form of access control?

---

## Options

### Option A

Keep one undifferentiated application. Rely on documentation and developer discipline to avoid
exposing engineering concepts when demonstrating the product to operators, and manually assemble
a reduced deployment by hand when installing on a Mac mini.

Advantages:

- No engineering work required now.
- `operator-preview` already gives a reasonable demo experience.

Disadvantages:

- Nothing stops the full developer surface (Task queue, Runtime control, Agent debug, raw
  source, tests, migrations, Git history) from reaching a customer's device.
- No least-privilege boundary between a business operator and the person who has physical/root
  access to the Mac mini (Device Admin).
- Manual, ad-hoc deployment assembly does not scale to Operator Cloud managing many customers.
- Violates Customer First Architecture: the system would remain, in practice, a developer tool
  wearing a demo skin.

### Option B

Formalize an Edition Boundary: one shared Core (Agents, Services, database, business logic) with
four Editions that each expose a different, enforced slice of it — Developer, Operator, Device
Admin, Operator Cloud — built and deployed independently but never duplicating business logic.

Advantages:

- Business logic stays in one place (Agents/Services), consistent with engineering-standards.md
  Rule 1 and Rule 4.
- Enforcement lives in code (a backend dependency, a build-time manifest), not only in what the
  frontend chooses to render.
- `operator-preview` graduates into real Operator Edition infrastructure instead of being
  discarded.
- Each Edition can evolve its own UI/menu/routing without touching Core.

Disadvantages:

- More structure to maintain: every new API route or frontend module now needs an explicit
  Edition assignment instead of being implicitly available to everyone.
- Some short-term ambiguity for modules that do not yet clearly belong to one Edition (see the
  companion inventory document) — resolved by marking them `undecided` rather than guessing.

---

## Decision

Choose **Option B**.

### Core Principles

1. **One Core, Multiple Editions.** All Editions share the same business Core. Business logic is
   never copied between Editions.
2. **No Business Logic in Editions.** An Edition is only UI, permissions, menu, routing and
   product configuration. Business logic belongs in the shared domain/service/package layer.
3. **Customer First Architecture.** AI Commerce OS is first an operating system for running a
   business, not a developer tool. No engineering vocabulary may appear in the Operator-facing
   experience.
4. **Build-time Boundary.** A customer delivery package is produced from an explicit build
   manifest. It is never a copy of the whole repository.
5. **Data Separation.** Application code, device configuration, customer data, secrets and logs
   are separated. An application upgrade must never overwrite a customer's database, business
   memory, shop credentials or message history.
6. **Least Privilege.** Operator, Device Admin, Developer and Operator Cloud each have distinct
   permissions. Hiding a menu item in the frontend is never sufficient on its own to satisfy this
   principle — the boundary must also hold at the API and build level.

---

## Consequences

Positive:

- The existing `operator-preview` prototype gets a real home and a real backend behind it instead
  of remaining a permanently client-only demo.
- Adding a new API route or frontend module now forces an explicit Edition decision, which
  prevents accidental exposure of developer-only capability to Operator/Device Admin surfaces.
- Device Admin and Operator Cloud become buildable concepts instead of undefined future work.

Negative:

- Every router file in `backend/app/api/v1/` needs an edition assignment (a one-time cost paid in
  this ADR's implementation round, see Migration Plan Phase 0).
- Contributors must consult the Module Ownership Matrix before adding new modules, rather than
  assuming everything is globally visible by default.

The long-term benefit of a real, enforced boundary outweighs the added structure.

---

## Rules Introduced

The following project rules become effective immediately.

1. No API route may be added to `backend/app/api/v1/` without an explicit `require_edition(...)`
   assignment (or a documented, deliberate decision to leave it ungated because it is genuinely
   Core infrastructure — e.g. `/health`, the external task integration gateway).
2. No frontend module may be added to the Operator or Device Admin surface without appearing in
   `scripts/editions/manifest.py`'s include list for that Edition.
3. A module whose Edition ownership is unclear must be recorded as `undecided` in the Edition
   Inventory. It must not be silently deleted, silently exposed to Operator/Device Admin, nor
   silently assumed to be Developer-only forever.
4. `EDITION` defaults to `developer` everywhere it is read. Any stricter Edition is always an
   explicit opt-in at deploy time, never an implicit consequence of forgetting to set it.
5. Business logic changes are made once, in Core (Agents/Services). If a change appears to
   require different business logic per Edition, that is a signal to stop and revisit this ADR,
   not to fork the logic.

---

## Four Edition Definitions

### 1. Developer Edition

Used only by people building the system. Includes the developer console (today's `App.jsx` +
`Sidebar.jsx` + `frontend/src/pages/`), Agent debugging, prompt/workflow debugging, Runtime
control, Task Center, logs, tests, migrations and development tooling. This is what the
repository already is today when `EDITION` is unset — Developer Edition is the default, not a
new thing that had to be built.

### 2. Operator Edition

Deployed on the operator's Mac mini. Faces the business owner running their store: business
cockpit, shop center, AI secretary, customer center, unified messaging, AI customer service,
WeCom private domain, livestream center, supply chain center, business analytics, business
settings. Must never expose Runtime, Task, Consumer, Prompt, Migration, Docker, raw JSON, source
code or Git concepts. `frontend/src/operator-preview/` is the current implementation of this
Edition's frontend (today gated by a URL query parameter as a prototype; see Migration Plan
Phase 1 for graduating it to the real entry point).

### 3. Device Admin Edition

Deployed on the operator's Mac mini, for the authorized implementer/maintainer only — not the
business owner. Device status, service status, platform connection status, database status,
backup, restore, version, update, licensing, diagnostics and log summaries. Must not expose full
developer capability, and must not expose the operator's business data beyond what is needed to
diagnose the device (Rule: Least Privilege, Principle F). No frontend exists for this Edition yet
— it is defined in `backend/app/core/edition.py`'s `Edition.DEVICE_ADMIN` and has a diagnostic-only
backend surface (see Permission Boundary), but its own small frontend is Migration Plan Phase 2.

### 4. Operator Cloud

Used by the platform operator, not deployed to any customer device. Manages every customer,
device, license, AI credit, model routing, version release, Agent package, prompt package,
connector package, industry knowledge package, billing, upgrades and remote support. Nothing in
this repository implements Operator Cloud today; it is recorded in the inventory as
`undecided / future ADR`, not invented here.

---

## Core Definition

Core is everything that is identical no matter which Edition is running on top of it:

- **Agents** (`backend/app/agents/`) — business logic, per engineering-standards.md Rule 1.
- **Services** (`backend/app/services/`) — the 30 files implementing domain operations
  (task/deliverable/shop/product/inventory/order/supplier/listing/store/analytics/knowledge/
  runtime/LLM-gateway logic, etc).
- **Database** (`backend/app/database/`, `backend/app/models/*_db.py`, `backend/migrations/`) —
  the 12 tables and their Alembic history. Schema is owned by Core; data ownership per Edition is
  covered separately below (Data Ownership Matrix).
- **Runtime** (`backend/app/runtime/`) — the task queue, executor, scheduler, event and engine
  subsystems.
- **Integrations** (`backend/app/integrations/platforms/`) — platform adapters, per
  engineering-standards.md Rule 4.
- **`automation/n8n/`** — task-dispatch plumbing used regardless of which Edition triggered the
  work.

An Edition is never allowed to reimplement any of the above. An Edition consists only of: which
API routes are reachable (`backend/app/core/edition.py`), which frontend modules are bundled
(`scripts/editions/manifest.py`), and how they are labeled/arranged for the person using them.

---

## Module Ownership Matrix

Category-level summary; the exhaustive per-file inventory (every page, API route, service, agent,
table and script in the repository today, each with its assigned Edition and the reasoning behind
it) is maintained in the companion document
[ADR-0002-edition-inventory.md](ADR-0002-edition-inventory.md), per the requirement that
ownership be based on actual code behavior, not naming guesses.

| Category | Owner |
|---|---|
| `backend/app/agents/`, `backend/app/services/` | Shared Core |
| `backend/app/runtime/`, `backend/app/integrations/` | Shared Core |
| `backend/app/models/*_db.py`, `backend/migrations/` | Shared Core (schema); see Data Ownership Matrix for data |
| `backend/app/api/v1/{tasks,agents,analytics}.py`, Runtime control routes | Developer Edition only |
| `backend/app/api/v1/{shops,deliverables,dashboard,knowledge,platforms,wecom,inventories,listings,orders,products,stores,suppliers}.py` | Developer + Operator Edition |
| `backend/app/api/v1/settings.py` (`system-info`, `integration-status`) | Developer + Device Admin Edition |
| `backend/app/api/v1/{integrations,health}.py` | Ungated Core infrastructure |
| `frontend/src/pages/`, `frontend/src/App.jsx`, `frontend/src/components/{tasks,runtime}/` | Developer Edition only |
| `frontend/src/operator-preview/`, `frontend/src/editions/` | Operator Edition |
| Device Admin frontend | Not built yet — `undecided`, Migration Plan Phase 2 |
| Operator Cloud (any layer) | Not built yet — `undecided`, future ADR |
| `automation/n8n/` | Shared Core infrastructure |
| Deployment scripts / Docker | Not built yet — `undecided`, Migration Plan Phase 3 |

---

## Data Ownership Matrix

| Data | Owner / Location | Rule |
|---|---|---|
| Application code | Repository, built per Edition | Never customer-device-writable; replaced wholesale on upgrade |
| Device configuration (`EDITION`, ports, local paths) | Device-local environment, outside the repo | Never bundled into a build artifact; never overwritten by an app upgrade |
| Customer business data (12 tables: shops, products, orders, inventories, listings, suppliers, stores, deliverables + versions, tasks, system_runtime_state) | Customer's own Postgres instance, device-local | Owned by the customer, never bundled with or reset by an application upgrade (Principle E) |
| Secrets (shop credentials via `credential_encryption_service.py`, LLM API keys, WeCom keys) | Environment variables / encrypted columns, never in source, never in logs | Never included in any build artifact or log; this repo's existing `SQLALCHEMY_ECHO` / credential-encryption discipline already enforces "never logged" — this ADR extends the same discipline to "never shipped" |
| Logs | Device-local, outside the repo | Device Admin Edition may see summaries; Operator Edition never sees raw logs; Developer Edition sees everything locally |
| Business memory / message history (WeCom, future secretary conversation state) | Customer's own database | Same as customer business data — never overwritten by an upgrade |

An application upgrade replaces code only. It must never touch the customer database, shop
credentials, or message history — this is a build/deploy-tooling requirement to be enforced when
Migration Plan Phase 3 (real packaging pipeline) is implemented; it is recorded here now so it is
not forgotten later.

---

## Permission Boundary

Enforced today by `backend/app/core/edition.py` (`Edition` enum, `get_active_edition()` reading
the `EDITION` environment variable, `require_edition(*allowed)` as a FastAPI dependency raising
`404` — not `403` — for a disallowed Edition, per Principle F). `EDITION` defaults to `developer`,
so every existing deployment and test keeps 100% of today's behavior unless `EDITION` is set
explicitly.

| Router / Route | Allowed Editions | Reasoning |
|---|---|---|
| `tasks.py`, `agents.py`, `analytics.py` (entire routers) | Developer | Explicitly forbidden concepts (Task/Agent/Runtime debug); not called by `operator-preview` |
| `runtime.py` — `GET /status` | Developer, Operator, Device Admin | Already called read-only by `operator-preview`'s real-data mode (`frontend/src/operator-preview/helpers/realDataApi.js`) |
| `runtime.py` — `POST /start`, `POST /stop`, `PUT /auto-resume`, `GET /consumer-status` | Developer | Control/debug surface; Device Admin's future start/stop rights are `undecided`, not granted yet |
| `settings.py` — `GET /llm-status` | Developer, Operator, Device Admin | Already called by `operator-preview` |
| `settings.py` — `GET /system-info`, `GET /integration-status` | Developer, Device Admin | Matches Device Admin's spec ("version/diagnostics/platform connection status"); not called by `operator-preview` |
| `shops.py`, `deliverables.py`, `dashboard.py`, `knowledge.py`, `platforms.py`, `wecom.py`, `inventories.py`, `listings.py`, `orders.py`, `products.py`, `stores.py`, `suppliers.py` | Developer, Operator | Operator-facing business/supply-chain surface per the spec's module list |
| `integrations.py`, `health.py` | Ungated | Machine-to-machine integration entrypoint and health check, not Edition-specific |

Verified by `backend/tests/test_edition_boundary.py`: default (`EDITION` unset) preserves full
access as a regression guard; `EDITION=operator` 404s every Developer-only route while keeping
Operator routes reachable; `EDITION=device-admin` 404s every Operator business route while
keeping the diagnostic routes reachable; an unrecognized `EDITION` value safely falls back to
`developer` rather than crashing or silently granting/denying the wrong thing.

---

## Build Boundary

`scripts/editions/manifest.py` defines, per Edition, which `frontend/src/` paths belong to it
(`FRONTEND_INCLUDE_PREFIXES`) and which paths are explicitly forbidden even if an include prefix
were ever written too broadly (`FRONTEND_FORBIDDEN_PREFIXES`), plus a Core-wide
`UNIVERSAL_FORBIDDEN_PREFIXES` list (tests, migrations, `.git`, `docs/`, lockfile-adjacent dev
files) that no customer-facing Edition package may ever contain.

`scripts/editions/check_boundary.py` (stdlib only, no dependencies to install) checks three
things against the real repository state (`git ls-files`, so it respects `.gitignore` the same
way a real package build would draw from tracked files):

1. **Manifest self-consistency** — an Edition's include prefixes never overlap its own forbidden
   prefixes or the universal forbidden list.
2. **Resolved file-list safety** — simulating "what would ship for this Edition today" never
   contains a forbidden path.
3. **Import boundary** — every JS/JSX file that would ship for an Edition is statically checked
   for `import` statements pointing into a directory that Edition explicitly forbids (e.g.
   Operator code importing from `frontend/src/pages/` or `frontend/src/components/tasks/`). This
   is the concrete, file-level answer to "an Edition boundary must not be implemented by CSS or
   frontend menu-hiding alone" — the check operates on source and import graphs, not on what is
   rendered.

What this round deliberately does **not** build: an actual Docker or customer-package generator,
per-Edition JavaScript bundle splitting (today's single `npm run build` still produces one bundle
containing both `App.jsx` and `OperatorPreviewApp.jsx`; `frontend/src/main.jsx` chooses between
them at runtime, not at build time), or CI wiring (no `.github/` exists in this repository at
all — adding CI is a separate decision from what this ADR's implementation round was asked to
do). These are named explicitly in the Migration Plan rather than silently deferred.

---

## Deployment Boundary

- **Developer Edition**: the developer's own machine, full repository checkout, `uv run` /
  `npm run dev`, exactly as documented in `docs/08-deployment/`.
- **Operator Edition** and **Device Admin Edition**: both deployed to the same Mac mini, as two
  separate processes/configurations of the same Core (`EDITION=operator` and
  `EDITION=device-admin` respectively) — never as two different repository copies, and never as
  one giving the other more access than its Edition allows.
- **Operator Cloud**: a distinct, multi-tenant service that is never deployed to a customer's
  device. Nothing in this repository implements it yet.

No Docker, docker-compose, or CI pipeline exists in this repository today (`docker/` is an empty
placeholder directory, no `.github/` exists). Real Mac mini packaging is Migration Plan Phase 3,
building on the manifest established in this ADR rather than starting over.

---

## Prohibitions

1. Operator Edition must never expose Runtime, Task, Consumer, Prompt, Migration, Docker, raw
   JSON, source code or Git concepts to the user.
2. Device Admin Edition must never expose full developer capability, nor the operator's business
   data beyond what device diagnostics require.
3. A customer delivery package must never contain source code beyond what that Edition's build
   manifest explicitly includes, test files, development documentation, Git metadata, or
   sensitive configuration. Checked by `scripts/editions/check_boundary.py`.
4. No Edition boundary may be implemented solely via CSS or frontend menu-hiding. Every boundary
   claimed in this ADR must also hold at the API layer (`require_edition`) or the build/import
   layer (`check_boundary.py`), independently of what the UI chooses to render.
5. Business logic must never be duplicated between Editions. A behavior difference between
   Editions is a permissions/routing/UI decision, never a second implementation of the same
   Agent or Service.
6. An application upgrade must never overwrite customer data, business memory, shop
   authorizations or message history (Principle E, Data Ownership Matrix).

---

## Migration Plan

1. **Phase 0 (this round)** — manifest, edition config, and permission-dependency scaffolding;
   the ADR and inventory documents; tests. Zero behavior change under the default
   `EDITION=developer` (verified: full backend test suite and frontend lint/test/build all pass
   unchanged).
2. **Phase 1** — graduate `frontend/src/operator-preview/` from prototype to the real Operator
   Edition entry point: drop the "prototype" banner, route it through `getActiveEdition()`
   instead of only the legacy `?mode=operator-preview` query override, keep it additive.
3. **Phase 2** — build the minimal Device Admin frontend surface (small — status/backup/version/
   diagnostics pages only, consuming the already-gated diagnostic routes) and turn on
   `check_boundary.py` as a CI gate once CI exists for this repository.
4. **Phase 3** — a real build/package pipeline (Docker or equivalent) that consumes
   `scripts/editions/manifest.py` to produce actual per-Edition customer artifacts, including
   per-Edition JavaScript bundle splitting so `main.jsx` no longer needs to import both `App.jsx`
   and `OperatorPreviewApp.jsx` in the same bundle. Operator Cloud gets its own ADR when work on
   it begins.

Modules recorded as `undecided` in the companion inventory are not migrated, deleted, or
reassigned by this round — they stay exactly as they are until a future phase makes an informed
decision about them.

---

## Acceptance Criteria

This round of work is complete when all of the following hold:

1. `docs/10-adr/ADR-0002-edition-boundary.md` and `docs/10-adr/ADR-0002-edition-inventory.md`
   exist and are internally consistent with each other and with the code.
2. `backend/app/core/edition.py` exists; `EDITION` unset behaves identically to before this ADR
   (regression-tested).
3. `EDITION=operator` cannot reach any Developer-only route; `EDITION=device-admin` cannot reach
   any Operator business route — both enforced by automated tests
   (`backend/tests/test_edition_boundary.py`), not manual verification.
4. `frontend/src/editions/editionConfig.js` exists and `frontend/src/main.jsx` uses it; existing
   pages and the existing `operator-preview` prototype behave exactly as before.
5. `scripts/editions/check_boundary.py --edition operator` and `--edition device-admin` both
   exit `0` against the real repository, and its own test suite
   (`scripts/editions/test_check_boundary.py`) passes.
6. Full existing test suites remain green: `cd backend && uv run pytest`, `cd frontend && npm run
   lint && npm run test && npm run build`.
7. No existing page, API route, or test was deleted or broken to satisfy this ADR.

---

## Future Evolution Principles

- New API routes are assigned an Edition at the moment they are created, not retrofitted later.
- New frontend modules for Operator or Device Admin are added under their Edition's directory
  (`frontend/src/operator-preview/`, and a future `frontend/src/device-admin/`) and registered in
  `scripts/editions/manifest.py` in the same change, not as a follow-up.
- A capability that seems to need different business logic per Edition is a signal to revisit
  this ADR before writing the code, not a reason to fork an Agent or Service.
- Operator Cloud, per-Edition build artifacts, and CI enforcement of the boundary are each
  separate future ADRs or specifications when their respective Migration Plan phase begins — this
  ADR intentionally does not pre-design them.
- `undecided` inventory items are revisited whenever the module they cover is next touched for
  unrelated reasons, not on a separate cleanup schedule.

---

## References

- ADR-0001 Engineering First (`docs/10-adr/ADR-0001-engineering-first.md`)
- DOC-003 Engineering Standards (`docs/00-project/engineering-standards.md`)
- RA-001 Business Cell Architecture, RA-004 Runtime Component Architecture, RA-006 Security
  Architecture (`docs/01-reference-architecture/`)
- API-002 Authentication API (`docs/07-api/API-002-authentication-api.md`) — the existing
  Administrator / Business Operator / Agent / External Platform / Read-only User actor taxonomy
  this ADR's Editions build on top of, at the deployment/build level rather than the per-request
  user-role level
- `frontend/src/operator-preview/` — the prototype this ADR formalizes and plans to graduate
  (Migration Plan Phase 1), not replace
- ADR-0002-edition-inventory.md — companion document, exhaustive per-module inventory
