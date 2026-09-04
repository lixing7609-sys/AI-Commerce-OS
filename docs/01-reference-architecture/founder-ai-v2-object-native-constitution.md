# Founder AI V2 Architecture Constitution

The lifecycle ownership and persistence contract is frozen in [AI Commerce OS Asset Lifecycle V1](./ai-commerce-os-asset-lifecycle-v1.md) and governs all Founder Object publication, execution, learning, and reuse.

Status: Frozen · Capability 1 — Founder AI V2 · Object Native Foundation

## Constitutional rules

1. Conversation is the only primary creation input. Founder discusses intent with Sino; the system recognizes objects. Skill, Agent, Workflow, Prompt and Application System views are not independent form-based sources of truth.
2. Object is the core durable unit. The extensible Object Layer currently admits Application System, Project, Agent, Skill, Workflow, Prompt, Capability, Connector, Task, Artifact, Decision, Constraint, Knowledge and Memory. UI structure must not define the allowed type system.
3. Workspace is the primary non-conversation interaction. The Sino home remains Conversation-first; other major surfaces evolve toward an Infinite Workspace instead of isolated static-card pages.
4. The only complete lifecycle is: Conversation → Object Recognition → Draft Object → Founder Review → Approved → Execution → Artifact → Memory / Evolution → Reopen Discussion.
5. Every object is reopenable. Reopened discussion attaches the current object and version as Conversation context and creates a revision; it never overwrites history.
6. Founder Object does not duplicate proven domain data. It links to Conversation, Task Asset, Execution Session, Artifact, Memory, Decision and Knowledge through stable references.
7. Infinite Workspace Object Graphs may grow only from persisted Founder Objects and persisted relations produced by real Conversation recognition. UI demonstrations, projections and empty-state decoration must never create mock nodes, mock lifecycle states or mock relations.

## Capability 1 compatibility boundary

- Conversation and message persistence remain authoritative for discussion evidence.
- TaskAsset remains the execution-ready task contract.
- Execution Registry and Execution Bridge remain authoritative for execution lifecycle.
- Artifact and Memory stores remain authoritative for outputs and evolution evidence.
- Application System remains a domain object; System Builder must migrate toward an architecture view over the Object Layer and must not create a second isolated registry.
- Existing Project Intelligence remains a distillation layer. Implementation Workspace displays technical Founder Objects first.

## Recognition contract

Object recognition is governed by the Founder Intent Engine contract. Conversation language is evidence, not a command grammar. The system must infer intent from the whole discussion and must never require a fixed phrase such as “创建 + Object Type”.

The mandatory boundary is: Conversation → Intent Recognition → Candidate Object/Change → Founder Review → Object mutation. Recognition may propose a change, but must not silently mutate the durable Object Layer before the review policy authorizes it. Create, Modify, Merge, Split, Delay, Approve, Reject, Archive and Reference Existing Object are first-class intents. The deterministic V1 recognizer is a compatibility adapter only and must not remain the product recognition policy.

Intent resolution must be semantic, evidence-linked, idempotent and identity-aware. It must use the active context object, conversation history and existing Founder Object Layer to distinguish a new object from a revision, relation or lifecycle transition. Ambiguous intent remains a candidate or pending question; it must not become a duplicate durable object.

## Migration plan

1. Introduce the unified Object identity, relationship and revision tables without moving existing records.
2. Link newly approved objects to existing TaskAsset and Execution records.
3. Add adapters for existing Application System, Artifact, Memory, Decision and Knowledge records.
4. Convert System Builder into an Object architecture projection.
5. Convert Assets & Memory into version/evolution projections over object references.

No phase may delete a proven store before reference parity and regression coverage exist.
