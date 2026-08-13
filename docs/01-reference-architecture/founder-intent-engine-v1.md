# Founder Intent Engine V1

Status: Design Frozen · implementation pending

## 1. Purpose

Founder Intent Engine converts natural Founder discussion into reviewable changes to the Founder Object Layer. It replaces phrase-driven object creation as the product policy.

Conversation is not a command form. Founder may discuss strategy, postpone work, compare alternatives, confirm a direction or revise an existing design without naming an Object Type. The engine interprets the discussion as a whole.

The canonical pipeline is:

Conversation Evidence → Intent Recognition → Entity Resolution → Candidate Object Change → Founder Review → Authorized Object Mutation

## 2. Intent vocabulary

The V1 intent enum is stable and extensible:

- `create`: propose a new durable object.
- `modify`: revise an existing object while preserving its stable `object_id` and creating a new revision.
- `merge`: combine two or more existing objects; retain provenance and redirect relations without silently deleting history.
- `split`: derive multiple candidates from one object; preserve lineage to the source object.
- `delay`: change an existing object lifecycle to `deferred`; it is not an archive or rejection.
- `approve`: authorize a reviewed candidate or existing draft for its lifecycle transition.
- `reject`: reject a candidate change; durable existing object history remains intact.
- `archive`: remove an existing object from active projections while retaining history.
- `reference_existing`: attach or relate an existing object to the current discussion without changing it.

An input may contain multiple intents. Each intent is independently evidenced, resolved and reviewed.

## 3. Recognition input

The engine receives a bounded `IntentRecognitionContext`:

```json
{
  "conversation_id": "conv-...",
  "trigger_message_id": "message-...",
  "founder_message": "...",
  "recent_messages": [],
  "conversation_summary": "...",
  "active_context_object": {},
  "candidate_objects_in_conversation": [],
  "existing_object_matches": [],
  "project_id": null
}
```

`recent_messages` must contain sufficient Founder/Sino evidence to interpret references such as “这个 Agent”, “先不要开发” and “合并刚才两个方案”. The active context object has precedence for pronoun/reference resolution. Existing object matches are retrieved before final classification; the model must not invent identity from memory.

## 4. Recognition output

Provider output is parsed through a defensive structured-output boundary and normalized to `FounderIntentResult`:

```json
{
  "intents": [
    {
      "intent_type": "delay",
      "target_object_id": "object-...",
      "target_object_type": "agent",
      "proposed_name": "广告投放 Agent",
      "proposed_status": "deferred",
      "proposed_patch": {"status": "deferred"},
      "relation_changes": [],
      "confidence": 0.94,
      "reason": "Founder 明确表示当前先不开发该对象",
      "source_message_refs": ["message-..."],
      "requires_review": true,
      "ambiguities": []
    }
  ]
}
```

Required invariants:

- `source_message_refs` must point to persisted evidence.
- `modify`, `delay`, `approve`, `reject`, `archive` and `reference_existing` require a resolved `target_object_id`.
- `create` must not carry a target identity unless it was reclassified as `modify` or `reference_existing`.
- `merge` requires at least two resolved source object IDs.
- `split` requires one resolved source object and at least two proposed candidates.
- Confidence is diagnostic, not authorization.
- Invalid or incomplete model output produces no durable mutation.

## 5. Candidate layer

Recognition output is persisted separately from `founder_objects`. The minimum candidate contract is:

```text
candidate_id
conversation_id
trigger_message_id
intent_type
target_object_id
proposed_object_type
proposed_name
proposed_description
proposed_status
proposed_patch
relation_changes
reason
confidence
source_message_refs
review_status: pending | approved | rejected | superseded
created_at
reviewed_at
```

This layer is the Implementation Workspace source. A Candidate is not yet a Founder Object and must not appear as a formal node in Infinite Workspace until approved, except as an explicitly marked draft projection if product policy later permits it.

Repeated recognition is idempotent by a fingerprint derived from conversation, target identity, normalized intent, proposed patch and source evidence. A newer candidate supersedes an equivalent pending candidate instead of duplicating it.

## 6. Entity resolution

Resolution order:

1. Explicit `active_context_object_id`.
2. Explicit object identifier or exact stable name in the discussion.
3. Objects already referenced by the current Conversation.
4. Project-scoped semantic candidates from the Founder Object Layer.
5. Founder-global semantic candidates.
6. Unresolved candidate requiring Founder clarification.

Name similarity alone cannot authorize merge or modification. Type, scope, relationships, source conversation and semantic purpose participate in identity scoring. When the top matches are ambiguous, the engine emits a pending question rather than creating another object.

## 7. Review and mutation policy

Founder Review is the default authorization boundary:

- `create`, `modify`, `merge`, `split`, `delay` and `archive` generate pending candidate changes.
- `approve` and `reject` may resolve an existing visible pending candidate when the reference is unambiguous and the Founder statement is explicit.
- Inferred approval is forbidden.
- Sino may explain and recommend, but cannot represent its own preference as Founder approval.

After approval, one transaction applies the mutation:

- Create: insert one stable Founder Object and initial revision.
- Modify/Delay: update the same `object_id`, increment version and append revision.
- Merge: select a survivor identity, preserve source revisions and redirect persisted relations according to an auditable merge record.
- Split: preserve the source and create children with lineage relations.
- Archive: retain revisions and references; remove only from active projections.
- Reference Existing: create conversation/object or object/object relation without version inflation unless durable object content changed.

Execution is not started by Recognition. Existing Approve → Task Asset → Execution remains the execution boundary.

## 8. Example behavior

Founder: “广告投放 Agent 现在先不要开发。”

Expected result:

```json
{
  "intent_type": "delay",
  "target_object_id": "resolved advertising agent id",
  "proposed_status": "deferred",
  "requires_review": true
}
```

It must not return “no object” merely because the sentence lacks “创建 Agent”. It must not create a second Advertising Agent.

Founder: “浏览器会话最好独立出来，Chrome 插件和自动化流程都依赖它。”

Possible result after context-aware analysis: one `create` candidate for a Browser Session Capability plus dependency relation candidates to two resolved existing objects. If “独立出来” refers to an existing embedded capability, the correct result may instead be `split`. The engine records the ambiguity when evidence is insufficient.

## 9. Runtime integration boundary

The Engine runs after the Founder message is persisted and may refine its result after the Sino reply, but both passes write to the same candidate identity. It is shared by Sino, single-round Council and auto-deliberation; those runtimes must not own separate recognition rules.

Implementation sequence:

1. Introduce Intent/Candidate persistence and schemas.
2. Add existing-object retrieval and active-context assembly.
3. Add provider-backed intent recognition with strict parsing and safe no-mutation failure.
4. Replace direct calls to `recognize_objects()` with orchestration through the Engine.
5. Make Implementation Workspace consume candidates plus approved object changes.
6. Add transactional review actions and revision/relation mutations.
7. Retire the deterministic recognizer from product traffic after parity tests; retain it only as an explicit offline/test fallback if needed.

## 10. Observability and acceptance

Each run records: trigger, context object, model/runtime, normalized intents, entity candidates, selected identity, confidence, reason, evidence refs, parse status, review status and mutation result. Logs must not expose provider secrets or full sensitive context.

Minimum acceptance cases:

- Natural strategic discussion proposes an object without fixed creation wording.
- “先不要开发” resolves an existing object and proposes `deferred`.
- Continuing discussion modifies the same `object_id` and creates one revision.
- Ambiguous reference creates no duplicate object.
- Merge and split preserve lineage.
- Approve/reject/archive target the intended candidate/object.
- Repeated runtime calls do not duplicate candidates or versions.
- Provider/parse failure leaves the durable Object Layer unchanged.
- Every approved mutation is traceable to Conversation messages and Founder review.
