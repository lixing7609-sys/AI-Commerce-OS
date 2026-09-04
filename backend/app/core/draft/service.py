from datetime import datetime, timezone
import hashlib
import json
import re

from sqlalchemy import select

from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import ConversationMessageDB, SinoBrainSessionDB
from app.core.draft.model import FounderDraftDB
from app.core.project.model import FounderProjectDB
from app.core.project.lifecycle_projection import project_lifecycle_projection
from app.database.db import SessionLocal


DRAFT_STATUSES = {"refining", "ready_for_review", "confirmed", "parked", "archived"}
DRAFT_OUTCOME_TYPES = {"project_definition", "system_definition", "architecture_proposal", "agent_proposal", "skill_proposal", "workflow_proposal", "prompt_proposal", "capability_proposal", "knowledge", "rule", "policy", "interface_definition", "brand_proposal", "business_proposal", "research_outcome", "document"}


def _status_for_maturity(maturity: dict) -> str:
    if maturity.get("review_status") == "founder_confirmed":
        return "confirmed"
    return "ready_for_review" if maturity.get("maturity_status") == "ready_for_review" else "refining"


def _iso(value):
    return value.isoformat() if value else None


def serialize_draft(record: FounderDraftDB, *, implementation: dict | None = None) -> dict:
    metadata = dict((record.structured_content or {}).get("_draft_meta") or {})
    return {
        "draft_id": record.id,
        "title": record.title,
        "draft_type": record.draft_type,
        "status": record.status,
        "project_id": record.project_id,
        "project_name": record.project_name,
        "source_conversation_id": record.source_conversation_id,
        "source_message_refs": list(record.source_message_refs or []),
        "source_cognitive_outcome_ref": record.source_cognitive_outcome_ref,
        "source_cognitive_outcome_refs": list(metadata.get("source_cognitive_outcome_refs") or [record.source_cognitive_outcome_ref]),
        "draft_semantic_id": metadata.get("semantic_id"),
        "summary": record.summary,
        "structured_content": dict(record.structured_content or {}),
        "new_findings": list(record.new_findings or []),
        "resolved_questions": list(record.resolved_questions or []),
        "remaining_questions": list(record.remaining_questions or []),
        "current_next_step": record.current_next_step,
        "version": record.version,
        "implementation": implementation,
        "created_at": _iso(record.created_at),
        "updated_at": _iso(record.updated_at),
    }


def _implementation_projection(session, record: FounderDraftDB) -> dict | None:
    state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == record.source_conversation_id))
    plan = dict(((state.discovery or {}).get("implementation_planning") or {})) if state else {}
    if not plan or plan.get("source_draft_id") != record.id:
        return None
    approval = plan.get("execution_approval") or "pending"
    package = dict(((state.discovery or {}).get("execution_package") or {}))
    proposal = dict(((state.discovery or {}).get("active_founder_gate_proposal") or {}))
    if package.get("source_draft_id") != record.id:
        package = {}
    package_next = "ready_for_execution" if package.get("preflight_status") == "ready" else "resolve_preflight_blocker" if package.get("preflight_status") == "blocked" else "founder_execution_exception" if package else None
    feedback = dict(((state.discovery or {}).get("execution_context_feedback") or {}))
    lifecycle = project_lifecycle_projection(state.discovery, conversation_stage=state.stage)
    projection = {
        "plan_id": plan.get("plan_id"),
        "status": plan.get("status"),
        "source_draft_id": plan.get("source_draft_id"),
        "source_draft_version": plan.get("source_draft_version"),
        "work_item_count": len(plan.get("work_items") or []),
        "execution_approval": approval,
        "next_step": lifecycle.get("next_step") or package_next or ("generate_execution_package" if approval == "approved" else "founder_execution_approval"),
        "project_lifecycle": lifecycle,
        "execution_package": {
            "package_id": package.get("package_id"),
            "preflight_status": package.get("preflight_status"),
            "execution_status": package.get("execution_status"),
            "founder_gate_proposal": proposal if proposal.get("execution_package_id") == package.get("package_id") else None,
        } if package else None,
    }
    if feedback:
        projection["implementation_result"] = feedback
    return projection


def _draft_type(outcome: dict) -> str:
    result = outcome.get("work_result") or {}
    document = result.get("document_draft") if isinstance(result, dict) else None
    sections = (document or {}).get("sections") or {}
    section_names = " ".join(str(key).lower() for key in sections)
    if document and "responsibil" in section_names and "boundar" in section_names:
        return "system_definition"
    proposed_type = next((item.get("type") for item in outcome.get("proposed_outcomes") or [] if item.get("type")), None)
    return proposed_type or "cognitive_outcome"


def _draft_payload(outcome: dict, *, conversation: ConversationDB, project: FounderProjectDB, state: SinoBrainSessionDB, messages: list[ConversationMessageDB]) -> dict:
    if not is_draft_worthy(outcome):
        raise ValueError("cognitive_outcome_not_draft_worthy")
    result = outcome.get("work_result")
    document = result.get("document_draft") if isinstance(result, dict) else None
    proposed = list(outcome.get("proposed_outcomes") or [])
    title = (document or {}).get("title") or next((item.get("title") for item in proposed if item.get("title")), None) or outcome.get("work_target")
    if not title:
        raise ValueError("cognitive_outcome_title_required")
    message_refs = [item.id for item in messages if (item.grounding or {}).get("cognitive_work", {}).get("cognitive_outcome_id") == outcome.get("cognitive_outcome_id")]
    maturity = dict((state.discovery or {}).get("discussion_maturity") or {})
    status = _status_for_maturity(maturity)
    narrative = str(outcome.get("narrative") or "").strip()
    return {
        "title": title,
        "draft_type": _draft_type(outcome),
        "status": status,
        "project_id": project.id,
        "project_name": project.name,
        "source_conversation_id": conversation.id,
        "source_message_refs": message_refs,
        "summary": narrative[:600],
        "structured_content": document or (result if isinstance(result, dict) else {"content": result}),
        "new_findings": list(outcome.get("new_findings") or []),
        "resolved_questions": list(outcome.get("resolved_questions") or []),
        "remaining_questions": list(outcome.get("new_questions") or []),
        "current_next_step": maturity.get("autonomous_next_analysis"),
    }


def _content_fingerprint(outcome: dict) -> str:
    value = {"work_result": outcome.get("work_result"), "proposed_outcomes": outcome.get("proposed_outcomes")}
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, default=str).encode()).hexdigest()


def _clean_canonical_title(title: str) -> str:
    return re.sub(r"[（(](?:草稿|初稿|细化版)[）)]$", "", title).strip()


def _unique_values(values: list) -> list:
    seen = set()
    result = []
    for value in values:
        key = json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)
        if key not in seen:
            seen.add(key)
            result.append(value)
    return result


def _merge_outcomes_into_draft(
    record: FounderDraftDB,
    *,
    outcomes: list[dict],
    payloads: list[dict],
    semantic_id: str,
    maturity: dict,
) -> None:
    """Project one artifact's Cognitive Outcome chain onto one durable Draft."""
    base_content = dict(payloads[0].get("structured_content") or {})
    refinements = []
    fingerprints = []
    source_outcome_refs = []
    message_refs = []
    findings = []
    resolved = []
    remaining = []
    for index, (outcome, payload) in enumerate(zip(outcomes, payloads)):
        fingerprint = _content_fingerprint(outcome)
        source_outcome_refs.append(outcome["cognitive_outcome_id"])
        message_refs.extend(payload.get("source_message_refs") or [])
        findings.extend(payload.get("new_findings") or [])
        resolved.extend(payload.get("resolved_questions") or [])
        remaining.extend(payload.get("remaining_questions") or [])
        if fingerprint in fingerprints:
            continue
        fingerprints.append(fingerprint)
        if index:
            refinements.append({
                "source_cognitive_outcome_ref": outcome["cognitive_outcome_id"],
                "title": payload.get("title"),
                "content": payload.get("structured_content") or {},
            })
    if refinements:
        base_content["refinements"] = refinements
    base_content["_draft_meta"] = {
        "semantic_id": semantic_id,
        "source_cognitive_outcome_refs": source_outcome_refs,
        "content_fingerprints": fingerprints,
    }
    record.title = _clean_canonical_title(payloads[0]["title"])
    record.draft_type = payloads[0]["draft_type"]
    record.status = _status_for_maturity(maturity)
    record.source_message_refs = list(dict.fromkeys(message_refs))
    record.structured_content = base_content
    record.new_findings = _unique_values(findings)
    record.resolved_questions = _unique_values(resolved)
    record.remaining_questions = _unique_values(remaining)
    record.current_next_step = maturity.get("autonomous_next_analysis")
    record.version = max(1, len(fingerprints))
    record.updated_at = datetime.now(timezone.utc)


def _artifact_groups(outcomes: list[dict], payloads: list[dict]) -> list[list[int]]:
    """Keep document refinements with the current definition; distinct artifact types stay separate."""
    groups: list[list[int]] = []
    group_types: list[str] = []
    for index, payload in enumerate(payloads):
        draft_type = payload["draft_type"]
        if draft_type == "document":
            definition_group = next((position for position in range(len(group_types) - 1, -1, -1) if group_types[position] in {"system_definition", "project_definition"}), None)
            if definition_group is not None:
                groups[definition_group].append(index)
                continue
        matching = next((position for position, value in enumerate(group_types) if value == draft_type), None)
        if matching is None:
            group_types.append(draft_type)
            groups.append([index])
        else:
            groups[matching].append(index)
    return groups


def is_draft_worthy(outcome: dict) -> bool:
    """Use existing outcome structure, never assistant-message text, to identify a durable result."""
    if outcome.get("completion_status") != "completed" or not outcome.get("work_result"):
        return False
    result = outcome.get("work_result")
    if isinstance(result, dict) and result.get("document_draft"):
        return True
    return any(item.get("type") in DRAFT_OUTCOME_TYPES and item.get("title") for item in outcome.get("proposed_outcomes") or [])


def sync_cognitive_outcome(*, conversation_id: str, cognitive_outcome_ref: str) -> dict:
    """Persist one independently useful Cognitive Outcome as one canonical Draft."""
    with SessionLocal() as session:
        conversation = session.get(ConversationDB, conversation_id)
        state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
        if conversation is None or state is None or not conversation.project_id:
            raise LookupError("Draft source conversation or project not found")
        project = session.get(FounderProjectDB, conversation.project_id)
        if project is None:
            raise LookupError("Draft source project not found")
        all_outcomes = list((state.discovery or {}).get("cognitive_outcomes") or [])
        outcome = next((item for item in all_outcomes if item.get("cognitive_outcome_id") == cognitive_outcome_ref), None)
        if outcome is None:
            raise LookupError("Cognitive Outcome not found")
        messages = list(session.scalars(select(ConversationMessageDB).where(ConversationMessageDB.conversation_id == conversation_id)))
        worthy_outcomes = [item for item in all_outcomes if is_draft_worthy(item)]
        payloads = [_draft_payload(item, conversation=conversation, project=project, state=state, messages=messages) for item in worthy_outcomes]
        target_index = next(index for index, item in enumerate(worthy_outcomes) if item.get("cognitive_outcome_id") == cognitive_outcome_ref)
        indexes = next(group for group in _artifact_groups(worthy_outcomes, payloads) if target_index in group)
        group_outcomes = [worthy_outcomes[index] for index in indexes]
        group_payloads = [payloads[index] for index in indexes]
        source_refs = {item["cognitive_outcome_id"] for item in group_outcomes}
        candidates = list(session.scalars(select(FounderDraftDB).where(FounderDraftDB.project_id == project.id, FounderDraftDB.source_cognitive_outcome_ref.in_(source_refs)).order_by(FounderDraftDB.created_at, FounderDraftDB.id)))
        record = candidates[0] if candidates else None
        created = record is None
        if record is None:
            record = FounderDraftDB(source_cognitive_outcome_ref=group_outcomes[0]["cognitive_outcome_id"], **group_payloads[0])
            session.add(record)
        semantic_id = f"{project.id}:{conversation.id}:{group_payloads[0]['draft_type']}"
        _merge_outcomes_into_draft(record, outcomes=group_outcomes, payloads=group_payloads, semantic_id=semantic_id, maturity=(state.discovery or {}).get("discussion_maturity") or {})
        for duplicate in candidates[1:]:
            duplicate.status = "archived"
            duplicate.updated_at = datetime.now(timezone.utc)
        session.commit(); session.refresh(record)
        return {"draft": serialize_draft(record), "created": created}


def sync_project_draft_status(*, conversation_id: str, maturity: dict, session_factory=SessionLocal) -> dict | None:
    """Consolidate each Project Planning artifact chain and project its maturity state."""
    with session_factory() as session:
        conversation = session.get(ConversationDB, conversation_id)
        if conversation is None or not conversation.project_id:
            return None
        state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
        project = session.get(FounderProjectDB, conversation.project_id)
        if state is None or project is None:
            return None
        outcomes = [item for item in ((state.discovery or {}).get("cognitive_outcomes") or []) if is_draft_worthy(item)]
        messages = list(session.scalars(select(ConversationMessageDB).where(ConversationMessageDB.conversation_id == conversation_id)))
        payloads = [_draft_payload(item, conversation=conversation, project=project, state=state, messages=messages) for item in outcomes]
        records = list(session.scalars(select(FounderDraftDB).where(FounderDraftDB.project_id == conversation.project_id).order_by(FounderDraftDB.created_at, FounderDraftDB.id)))
        if not records:
            return None
        canonical_result = None
        for indexes in _artifact_groups(outcomes, payloads):
            group_outcomes = [outcomes[index] for index in indexes]
            group_payloads = [payloads[index] for index in indexes]
            source_refs = {item["cognitive_outcome_id"] for item in group_outcomes}
            candidates = [item for item in records if item.source_cognitive_outcome_ref in source_refs]
            if not candidates:
                continue
            canonical = candidates[0]
            semantic_id = f"{project.id}:{conversation.id}:{group_payloads[0]['draft_type']}"
            _merge_outcomes_into_draft(canonical, outcomes=group_outcomes, payloads=group_payloads, semantic_id=semantic_id, maturity=maturity)
            for duplicate in candidates[1:]:
                duplicate.status = "archived"
                duplicate.updated_at = datetime.now(timezone.utc)
            canonical_result = serialize_draft(canonical)
        session.commit()
        return canonical_result


def ensure_project_definition_draft(*, conversation_id: str, session_factory=SessionLocal) -> dict | None:
    """Materialize one canonical review target from persisted planning outcomes."""
    with session_factory() as session:
        conversation = session.get(ConversationDB, conversation_id)
        state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
        if conversation is None or state is None or not conversation.project_id:
            return None
        maturity = dict((state.discovery or {}).get("discussion_maturity") or {})
        if maturity.get("maturity_status") != "ready_for_review":
            return None
        outcomes = [dict(item) for item in maturity.get("outcomes") or []]
        definition = next((item for item in outcomes if item.get("outcome_type") == "project_definition"), None)
        if definition is None:
            return None
        project = session.get(FounderProjectDB, conversation.project_id)
        if project is None:
            return None
        active = list(session.scalars(select(FounderDraftDB).where(
            FounderDraftDB.project_id == project.id,
            FounderDraftDB.source_conversation_id == conversation_id,
            FounderDraftDB.draft_type.in_(["project_definition", "system_definition"]),
            FounderDraftDB.status != "archived",
        ).order_by(FounderDraftDB.created_at, FounderDraftDB.id)))
        record = active[0] if active else None
        created = record is None
        canonical_source_ref = "planning-outcome-" + hashlib.sha256(f"{conversation_id}:{definition.get('outcome_id')}".encode()).hexdigest()[:20]
        if record is None:
            record = FounderDraftDB(
                title=definition.get("title") or f"{project.name} Project Definition",
                draft_type="project_definition", status="ready_for_review",
                project_id=project.id, project_name=project.name,
                source_conversation_id=conversation_id,
                source_cognitive_outcome_ref=canonical_source_ref,
            )
            session.add(record)
        source_message_refs = list(dict.fromkeys(ref for item in outcomes for ref in (item.get("source_message_refs") or [])))
        sections = {
            "project_definition": definition.get("content"),
            "constraints": [item.get("content") for item in outcomes if item.get("outcome_type") == "constraint"],
            "knowledge": [item.get("content") for item in outcomes if item.get("outcome_type") == "knowledge"],
            "pending_questions": [item.get("content") for item in outcomes if item.get("outcome_type") == "pending_question"],
            "proposals": [item.get("content") for item in outcomes if item.get("outcome_type") == "new_project_proposal"],
        }
        from app.core.project.service import assemble_project_context
        project_context = assemble_project_context(project.id)
        child_context = dict(project_context.get("child_project_context") or {})
        evidence = list(child_context.get("real_dependency_evidence") or [])
        provenance = {
            "source_conversation_id": conversation_id,
            "source_message_refs": source_message_refs,
            "source_outcome_refs": [item.get("outcome_id") for item in outcomes if item.get("outcome_id")],
            "source_constitution_id": ((project_context.get("parent_confirmed_context") or {}).get("constitution") or {}).get("source_conversation_id"),
            "source_work_item_id": child_context.get("source_work_item_id"),
            "source_proposal_id": child_context.get("source_proposal_id"),
            "source_dependency_ids": [item.get("dependency_id") for item in evidence],
            "source_dependency_projects": [item.get("source_project_id") for item in evidence],
            "source_execution_sessions": [item.get("source_execution_session_id") for item in evidence],
            "source_execution_packages": [item.get("source_execution_package_id") for item in evidence],
        }
        fingerprint = hashlib.sha256(json.dumps({"sections": sections, "provenance": provenance}, ensure_ascii=False, sort_keys=True, default=str).encode()).hexdigest()
        metadata = dict((record.structured_content or {}).get("_draft_meta") or {})
        previous_fingerprint = metadata.get("content_fingerprint")
        record.title = definition.get("title") or f"{project.name} Project Definition"
        record.status = "ready_for_review" if record.status != "confirmed" else "confirmed"
        record.source_message_refs = source_message_refs
        record.summary = str(maturity.get("reason") or "")
        record.structured_content = {
            "sections": sections,
            "project_context": {
                "project_id": project.id, "project_name": project.name,
                "parent_project_id": child_context.get("parent_project_id"),
                "architecture_role": child_context.get("architecture_role"),
                "initial_positioning": child_context.get("initial_positioning"),
                "initial_scope": child_context.get("initial_scope"),
            },
            "provenance": provenance,
            "_draft_meta": {
                "semantic_id": f"{project.id}:{record.draft_type}",
                "source_cognitive_outcome_refs": provenance["source_outcome_refs"],
                "content_fingerprint": fingerprint,
            },
        }
        record.remaining_questions = sections["pending_questions"]
        record.current_next_step = "Founder Review"
        if not created and previous_fingerprint and previous_fingerprint != fingerprint:
            record.version += 1
        record.updated_at = datetime.now(timezone.utc)
        for duplicate in active[1:]:
            duplicate.status = "archived"
            duplicate.updated_at = datetime.now(timezone.utc)
        # Repair only the legacy impossible state left by a failed confirmation:
        # review was marked confirmed although no reviewable Draft existed.
        if created and maturity.get("review_status") == "founder_confirmed" and state.stage == "project_planning":
            discovery = dict(state.discovery or {})
            maturity["review_status"] = "awaiting_founder_review"
            maturity.pop("founder_reviewed_at", None)
            discovery["discussion_maturity"] = maturity
            state.discovery = discovery
        session.commit(); session.refresh(record)
        return {"draft": serialize_draft(record), "created": created}


def list_drafts(*, project_id: str | None = None, include_archived: bool = False) -> list[dict]:
    with SessionLocal() as session:
        query = select(FounderDraftDB)
        if project_id:
            query = query.where(FounderDraftDB.project_id == project_id)
        if not include_archived:
            query = query.where(FounderDraftDB.status != "archived")
        records = session.scalars(query.order_by(FounderDraftDB.updated_at.desc())).all()
        return [serialize_draft(item, implementation=_implementation_projection(session, item)) for item in records]


def get_draft(draft_id: str) -> dict:
    with SessionLocal() as session:
        record = session.get(FounderDraftDB, draft_id)
        if record is None:
            raise LookupError("Draft not found")
        return serialize_draft(record, implementation=_implementation_projection(session, record))


def confirm_project_draft(*, conversation_id: str, session_factory=SessionLocal) -> dict:
    """Confirm the one active canonical review target without re-projecting its content."""
    with session_factory() as session:
        records = list(session.scalars(select(FounderDraftDB).where(
            FounderDraftDB.source_conversation_id == conversation_id,
            FounderDraftDB.status == "ready_for_review",
        ).order_by(FounderDraftDB.updated_at.desc(), FounderDraftDB.id)))
        if not records:
            existing = session.scalar(select(FounderDraftDB).where(FounderDraftDB.source_conversation_id == conversation_id, FounderDraftDB.status == "confirmed").order_by(FounderDraftDB.updated_at.desc()))
            if existing:
                return serialize_draft(existing)
            raise LookupError("Reviewable Project Definition Draft not found")
        canonical = records[0]
        canonical.status = "confirmed"
        canonical.updated_at = datetime.now(timezone.utc)
        for duplicate in records[1:]:
            duplicate.status = "archived"
            duplicate.updated_at = datetime.now(timezone.utc)
        session.commit(); session.refresh(canonical)
        return serialize_draft(canonical)
