# AI Commerce OS Founder Master Edition — Development Charter

Version 1.0
Date 2026-07-30
Status Accepted — sole architecture authority for `frontend/src/console/`, per
[ADR-0007](../10-adr/ADR-0007-founder-master-edition-development-charter.md), superseding
[ADR-0002B](../10-adr/ADR-0002B-founder-v4-architecture-freeze.md) and
[founder-v4-architecture-freeze.md](../01-reference-architecture/founder-v4-architecture-freeze.md)
in full.

This document is the highest architecture specification for AI Commerce OS. Future development
follows this document, not chat instructions or ad-hoc commits. Any structural change to the tree
below requires a new ADR (see Governance, §7).

---

## 1. One product

AI Commerce OS has one product under active, hand-built development: **AI Commerce OS Founder
(Master Edition)**. Every other edition — AI Commerce OS Operator, AI Commerce OS Studio, AI
Commerce OS Cloud, and any future industry edition — is generated from Founder by permission,
navigation pruning, and feature exposure. There is one architecture, one codebase
(`frontend/src/console/` as the source of truth, one Vite SPA per
`frontend/src/editions/editionConfig.js`), one source of truth.

The standalone entry apps that exist today (`frontend/src/operator-preview/`,
`frontend/src/studio/`, `frontend/src/cloud/`) are **legacy compatibility shells**, not
independent products. They are not deleted in this round, but no new independent implementation
may be built for them — they consume the same shared navigation/registry/page definitions
Founder's embedded Operator Lab and Studio Lab use, and their remaining independent code migrates
into Founder's shared modules over time.

## 2. What Founder is

Founder is not a developer backend, admin backend, or operator backend. Founder is **AI Commerce
OS Mission Control**, combining four identities:

1. AI Capability Development Center
2. First Real Operator
3. Studio Verification Center
4. Cloud Control Center

## 3. The frozen navigation tree

Exactly 5 top-level groups. No sixth group, no orphaned tail group outside this tree.

### 3.1 Founder Workspace (Mission Control)

Today · Decisions · Development · Business Validation · Content Validation · Cloud Status · Risks
· Notifications

One executive operating system, not seven unrelated dashboards. All 8 items share one entity
model (Decision, Risk, Validation Metric, Notification — each with `status`, `owner`,
`sourceModule`, `linkedModuleUrl`), one status vocabulary (`pending / in-review / approved /
blocked / resolved`), and drill-down links back into the module that produced the underlying data.

### 3.2 AI Capability Center

Agent Center · Prompt Center · Skill Center · Workflow Center · Knowledge Center · Connector
Center · Capability Center

Not CRUD, not management. This is Founder's production center for AI capabilities, organized
around one lifecycle: **design → configure → test → evaluate → approve → release → observe →
improve.** Every sub-center exposes where its capabilities sit in this lifecycle and supports a
scope filter (All / Founder-internal / Operator / Studio / Cloud) so a specific edition's capability
usage is visible from here — never duplicated as a separate Founder-only nav tree elsewhere (see
§3.4's absorption of the former Studio experiment layer).

### 3.3 Operator Lab

Workspace · Products · Orders · Customers · Customer Service · Marketing · Advertising · Brand ·
AI Secretary · Data · Finance & Profit · Organization · Settings

Treated exactly like a future commercial Operator edition — the first real Operator, never
Developer Mode. Operator consumes AI capabilities; it does not create them. Its operating loop is
**product → store → content → marketing → advertising → customer → order → fulfillment →
finance/profit → analytics → secretary/approval.** Store and channel connections stay strictly
business-facing (platform names — "Connect Taobao," "Connect Douyin," "Connect Xiaohongshu");
Operator never sees Founder-level API, webhook, diagnostic, or infrastructure controls.

### 3.4 Studio Lab

Workspace · AI Image · AI Video · AI Article · AI Live · AI Short Drama · AI Audio · Matrix
Accounts · Publishing Center · Asset Library · Brand Assets · Analytics · Settings

Treated exactly like a future Studio edition — everything produced here can enter real operation.
**Each content type owns its own end-to-end production pipeline as tabs inside its own workbench**
(e.g. AI Short Drama: Idea→Script→Storyboard→Character→Scene→Voice→Video→Subtitle→Review→Publish;
AI Video: Idea→Script→Shot List→Generate→Edit→Review→Publish; AI Image: Idea→Prompt→Generate→
Edit→Review→Asset Library; AI Article: Research→Outline→Draft→Rewrite→Review→Publish). Workspace
is project overview, production queue, calendar, assignments, approvals, and cross-project
management only — it does not own a shared production pipeline.

Studio does not create AI capabilities either. The Founder-only "Studio experiment layer" that
previously lived as an unexplained tail block under Studio Lab's own nav (`studioAgents` through
`studioReleases`, 11 keys) is retired from Studio Lab's nav entirely and absorbed into AI
Capability Center as the **Studio scope** filter across the relevant sub-centers (Agent Center,
Prompt Center, Workflow Center, Capability Center) — consistent with the principle that a
consuming edition never carries Founder's own capability-authoring tooling in its nav.

### 3.5 Cloud Center

Devices · OTA · License · Token · Marketplace · Version · Assets · Nodes · Monitoring · Logs

A fleet and commercial operations system — devices, operators, OTA, licenses, tokens,
marketplace, versions, assets, nodes, monitoring, logs, distributed scheduling, and release
channels. Never reduced to a pair of status tables. Current deployment target: NAS. Future:
Cloud.

## 4. Capability Principle

Founder creates AI capability. Operator uses AI capability. Studio uses AI capability. Cloud
distributes AI capability. Responsibilities are never mixed. Lifecycle: Design → Test → Version →
Publish → Upgrade → Use.

## 5. Connector Principle

Connector Center (inside AI Capability Center) develops connector products across four
categories — Platform (Taobao, Douyin, Xiaohongshu, TikTok, Amazon, Shopee), AI (GPT, Claude,
Gemini, DeepSeek, Kimi, Qwen), Infrastructure (NAS, PostgreSQL, Redis, REST API, Webhook), and
Enterprise (ERP, CRM, OMS, WMS). Operator never sees technical connectors — only business-facing
platform connections. Studio only sees AI production connectors. Cloud only sees infrastructure
connectors.

## 6. Workbench Principle

Every page is a real workbench: a Designer, Studio, Workbench, Workflow, Pipeline, or Canvas —
never "Coming Soon," a placeholder, an empty page, a bare CRUD table, or a management list. Every
page has a complete layout, real information hierarchy, realistic mock data (even where the
backend is incomplete), primary actions, filters/controls where relevant, status states,
loading/empty/error states where meaningful, and visible cross-links to the other Founder modules
it relates to. The page must already communicate the final product.

## 7. Governance

This charter is the highest architecture specification. Any structural change to the 5-group tree
in §3 — adding, removing, or renaming a top-level group or one of its fixed second-level items —
requires a new ADR before implementation, following the same unfreeze discipline ADR-0002B
introduced (and which this charter's own supersession proves must actually be followed this time).

Every capability, module, or page retired from a prior nav tree during the transition to this
charter is accounted for in the phase-by-phase migration maps executed alongside this document
(see the implementation plan and its resulting commit history) — absorbed into a new home, kept
as a hidden resolvable deep link, or explicitly marked obsolete with a reason. None are silently
dropped.

## 8. Superseded documents

- [`docs/01-reference-architecture/founder-v4-architecture-freeze.md`](../01-reference-architecture/founder-v4-architecture-freeze.md) — the prior 18-module/5-section freeze, retained for history.
- [ADR-0002B](../10-adr/ADR-0002B-founder-v4-architecture-freeze.md) — the prior freeze decision, retained for history.

[ADR-0002 Edition Boundary](../10-adr/ADR-0002-edition-boundary.md) remains in force for the
underlying edition-selector mechanism; this charter supersedes only the equal-editions navigation
model it previously implied for Founder's own console.
