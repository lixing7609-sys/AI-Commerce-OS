# Legacy API Cleanup Audit V1

## Audit Baseline

- Repository: `AI-Commerce-OS`
- Baseline commit: `553266fc3fa68490f0919fcf0b3d9c299accf2ca`
- Scope: read-only route, frontend dependency, model/table and service audit.
- No routes, contracts, tables, migrations or frontend files were changed.

## Route Inventory

### Canonical Asset API（KEEP）

- `/api/v1/application-systems`
- `/api/v1/conversations`
- `/api/v1/conversations/{id}/context`
- `/api/v1/decisions`
- `/api/v1/task-assets`
- `/api/v1/artifacts`
- `/api/v1/memories`

These routes are implemented under `backend/app/core/*/api.py`, consume `backend/core/*` models through application adapters, and enforce the Founder system boundary.

### Legacy / Product Infrastructure API（KEEP for compatibility）

- `/api/v1/tasks` — legacy TaskDB, recovery, consumer and execution operations.
- `/api/v1/deliverables` — Deliverable and version/export/approval workflow.
- `/api/v1/knowledge` — knowledge document service.
- `/api/v1/runtime` — runtime state and control.
- `/api/v1/agents`, `/api/v1/integrations`, `/api/v1/shops`, `/api/v1/products`, `/api/v1/orders`, `/api/v1/stores`, `/api/v1/suppliers`, `/api/v1/listings`, `/api/v1/inventories`, `/api/v1/platforms`, `/api/v1/settings` — existing product/infrastructure contracts.
- `/api/v1/dashboard`, `/api/v1/analytics` — dashboard and aggregate operational views.

### Route classification

| Route family | Classification | Recommended action |
|---|---|---|
| Canonical asset routes | KEEP | Treat as canonical SSOT APIs |
| `/tasks` | DEPRECATE after adapter | Keep while TaskDB consumers remain; do not overwrite |
| `/task-assets` | KEEP | Canonical TaskAsset API; currently avoids `/tasks` collision |
| `/deliverables` | DEPRECATE after projection | Bridge to ArtifactAsset only after version/export parity |
| `/knowledge` | KEEP / MERGE later | Knowledge is not automatically MemoryAsset |
| `/runtime`, `/agents`, integrations and commerce routes | KEEP | Internal/product infrastructure, outside this cleanup |
| dashboard/analytics | INTERNAL / DEPRECATE later | Replace only after frontend dependency migration |

## Task Migration

### Current implementation

**Legacy Task API**

- Router: `backend/app/api/v1/tasks.py`
- Model: `backend/app/models/task_db.py`
- Services: `task_service.py`, `task_execution_service.py`, `task_submission_service.py`, `task_recovery_service.py`, `task_recovery_action_service.py`, `task_delegation_service.py`
- Frontend: `frontend/src/services/api.js`, `taskApi.js`, `types/task.js`, task pages/components, analytics and secretary modules.

**Canonical TaskAsset API**

- Router/service/model: `backend/app/core/task_asset/`
- Model: `backend/core/task_asset/model.py`
- API: `/api/v1/task-assets`
- Relations: `conversation_id`, `decision_id`, `system_id`

### Migration plan

1. Define a field mapping from TaskDB (`status`, `payload`, `result`, execution fields) to TaskAsset (`scope`, lifecycle and result).
2. Add read projection or adapter; do not dual-write until idempotency and rollback are tested.
3. Migrate frontend reads by capability, not by global route replacement.
4. Version or deprecate `/api/v1/tasks` only after Runtime, Recovery and external submission consumers are migrated.
5. Preserve TaskDB for historical and operational execution data until final verification.

## Artifact Migration

### Current implementation

**Canonical**

- `backend/app/core/artifact/`
- `backend/core/artifact/model.py`
- API: `/api/v1/artifacts`
- Relations: TaskAsset, DecisionAsset, Conversation.

**Legacy**

- Router: `backend/app/api/v1/deliverables.py`
- Models: `backend/app/models/deliverable_db.py`, `DeliverableVersionDB`
- Services: `deliverable_service.py`, `deliverable_export_service.py`
- Frontend: `services/deliverableApi.js`, Deliverable Center, approval center, operator adapters.

### Migration plan

1. Map Deliverable identity/version to ArtifactAsset `title`, `content_ref`, `location`, `version` and status.
2. Preserve Deliverable export, approval, regeneration and follow-up-task behavior through an adapter.
3. Project legacy versions into ArtifactAsset only after content parity and version ordering are verified.
4. Keep `/deliverables` until all frontend and operational consumers use `/artifacts`.

## Memory Migration

### Current implementation

**Canonical**

- `backend/app/core/memory/`
- `backend/core/memory/model.py`
- API: `/api/v1/memories`
- Relations: Conversation, Decision, TaskAsset, ArtifactAsset.

**Legacy / adjacent concepts**

- `/api/v1/knowledge` and `KnowledgeService`: indexed business documents and source knowledge.
- History: conversation or version history, not automatically durable memory.
- Runtime memory snapshots in tests/services: process/runtime state, not MemoryAsset.
- No dedicated `business-memory` API was found in the current route inventory.

### Knowledge vs MemoryAsset

| Concept | Meaning | Migration treatment |
|---|---|---|
| Knowledge | Source documents and retrieval corpus | KEEP as source system; optionally reference from MemoryAsset |
| History | Audit/version chronology | KEEP as history; do not flatten into memory |
| Runtime snapshot | Operational process state | KEEP internal; never expose as long-term memory |
| MemoryAsset | Durable Founder application memory | Canonical `/memories` SSOT |

### Migration plan

1. Define explicit memory extraction rules and provenance.
2. Create projections only for confirmed decisions, patterns or experiences.
3. Keep Knowledge and History APIs stable while consumers are inventoried.
4. Do not introduce embeddings, vector storage or Evolution behavior in this cleanup phase.

## Frontend Dependencies

### Legacy API consumers

| API | Frontend consumers | Risk |
|---|---|---|
| `/tasks` | `services/api.js`, `services/taskApi.js`, TaskCenter, Agents, Overview, Dashboard, Secretary, operator shared pages | High: route is coupled to TaskDB/Runtime behavior |
| `/deliverables` | `services/deliverableApi.js`, DeliverableCenter, ApprovalCenter, operator shared products | High: version/export/approval semantics |
| `/knowledge` | `services/knowledgeApi.js`, KnowledgeBase, operator real-data adapter | Medium: source corpus semantics |
| `/runtime` | `services/runtimeApi.js`, RuntimeStatusPanel, dashboards and operator settings | High: operational control |
| `/agents`, `/analytics`, commerce APIs | Agent pages, analytics and product/store/order modules | Medium: product capabilities, not asset cleanup |

No current frontend references to `/api/v1/task-assets`, `/api/v1/artifacts` or `/api/v1/memories` were found in the scanned service files. Canonical APIs therefore exist before their experience-layer adoption.

## Database Dependencies

### Canonical tables（KEEP）

- `application_systems`
- `conversations`
- `conversation_contexts`
- `decision_assets`
- `task_assets`
- `artifact_assets`
- `memory_assets`

### Legacy tables still actively used

- `tasks` / `TaskDB`: task service, execution, recovery, delegation, analytics, shop aggregation and many tests.
- `deliverables` / `deliverable_versions`: deliverable service, exports, dashboard and approval flows.
- Knowledge-related tables/services: Knowledge API and frontend adapters.
- Runtime state, operation logs, provider/token tables: infrastructure dependencies.

These tables cannot be deprecated safely until read/write consumers, historical data and rollback behavior are mapped.

## Cleanup Priority

### P0 — Inventory and compatibility

- Record every consumer of `/tasks` and `/deliverables`.
- Add contract tests for canonical and legacy responses.
- Define adapters without changing existing routes.

### P1 — Canonical read projections

- Add TaskDB → TaskAsset projection.
- Add Deliverable/version → ArtifactAsset projection.
- Establish provenance for Knowledge/History → MemoryAsset candidates.

### P2 — Frontend migration

- Move Founder-facing asset views to canonical APIs.
- Keep Runtime and Operator experiences on legacy APIs until equivalent capabilities exist.

### P3 — Deprecation

- Version legacy routes, publish deprecation metadata, and migrate remaining consumers.
- Only then evaluate old tables and routes for removal.

## Recommended Sequence

1. Preserve all current contracts and add compatibility tests.
2. Complete TaskDB/TaskAsset adapter and route ownership decision.
3. Complete Deliverable/ArtifactAsset version and export projection.
4. Define Knowledge/History/MemoryAsset provenance rules.
5. Migrate frontend consumers incrementally.
6. Version legacy APIs and run full Runtime/Frontend regression.
7. Consider database cleanup only after rollback and historical verification.

## Conclusion

The canonical asset APIs are present, but Legacy TaskDB and Deliverable APIs remain heavily used. The highest-risk cleanup is `/api/v1/tasks`; it must not be overwritten. Artifact migration is next, while Knowledge remains a source system rather than a direct MemoryAsset replacement. No destructive cleanup is safe in the current phase.
