# AI Commerce OS Asset Lifecycle V1 Freeze

Status: V1 product and data-boundary freeze  
Effective: 2026-08-14

## Canonical lifecycle

`Founder → Idea → Brain → Asset → Execution → Learning → Reuse`

Brain is the existing staged workflow:

`Idea → Goal Understanding → Strategy Meeting → Validation → Decision → Discussion Package → Founder Approval → Asset Commit`

This is a lifecycle contract, not a second product or a demonstration graph.

## Ownership boundaries

- **Conversation** stores Founder/Sino/provider discussion and stage history. It is not an asset catalog, package repository, or execution log. Internal Brain events never become sidebar conversations.
- **Discussion Package** transports one Brain outcome for package-level Founder approval. Its lifecycle is `draft → waiting_approval → approved → committed → archived`. It is not the final repository.
- **Asset Center** catalogs approved, durable, reusable Decision, Project, Workflow, Skill, Prompt, Knowledge, Capability, Agent, and Connector assets. A catalog row references the native record; it does not copy a second domain object.
- **Execution Center** owns plan, task package, runtime/Codex/workflow run, test/build/git/deployment result, error, retry, and rollback. Execution Result is never an ordinary Asset Center asset.
- **Learning** references a real Asset and Execution, extracts outcome and recommendations, and proposes `no_update`, `update_existing_asset`, or `create_new_asset`. V1 provides the persistent framework and deterministic result summary; autonomous learning judgment remains future work.
- **Reuse** creates a typed reference from one stable Asset ID to a new Conversation or Project. It never clones the Asset.

## Identity and non-duplication

The Asset Catalog is a lifecycle index over existing native stores. `native_type + native_id` is unique. For Founder Objects the stable `object_id` is also the `asset_id`. AI Capability Center edits the capability object; Asset Center presents its committed lifecycle version. Other screens keep references only.

Every formal asset records source Conversation, source Package, Project, version, status, dependencies, usage references, executions, and learnings. Deleted or unavailable source conversations do not delete committed assets.

## Status contract

The top-level lifecycle uses `idea`, `brain`, `package`, `approved`, `committed`, `execution`, `learning`, `reusable`, and `completed`. Domain objects retain their existing sub-statuses. Synonymous presentation labels must map to these stable internal values rather than introduce new enums.

## Migration rule

Existing approved Founder Objects, confirmed Decisions, active Projects, Knowledge memories, and non-technical legacy artifacts are indexed without deletion or identity change. Technical/execution artifacts stay in Execution Center. Legacy categories remain available as compatibility metadata, not as the primary Asset Center taxonomy.

## Extension constraint

Agent, Skill, Workflow, Studio, Operator, Industrial, Quant, and future applications must preserve this lifecycle and ownership boundary. New functionality may extend stages, native asset detail, execution adapters, or learning intelligence, but may not merge Conversation, Package, Asset, Execution, or Learning into one data class or duplicate the same asset across centers.
