import json
from datetime import datetime, timezone

from sqlalchemy import func, select

from app.core.artifact.model import ArtifactAssetDB
from app.core.memory.model import MemoryAssetDB
from app.core.project.model import FounderProjectDB, ProjectIntelligenceDB
from app.core.asset_lifecycle.model import AssetCatalogDB
from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import CandidateGoalDB, GoalAssetDB, PendingQuestionDB, SecretaryDigestDB
from app.core.decision.model import DecisionAssetDB
from app.database.db import SessionLocal

FOUNDER_SYSTEM_KEY = "founder_ai"
DEFAULT_PROJECT_ID = "project-ai-commerce-os"
TECHNICAL_ASSET_TYPES = {"execution_result", "technical_evidence", "code_change", "test_result", "commit", "log"}
STRATEGIC_ASSET_TYPES = {"strategy", "strategic_asset", "strategic_positioning", "roadmap", "capability_map", "strategic_decision"}


def list_projects() -> list[FounderProjectDB]:
    with SessionLocal() as session:
        return list(session.scalars(select(FounderProjectDB).where(FounderProjectDB.system_id == FOUNDER_SYSTEM_KEY, FounderProjectDB.status.in_(["active", "committed"])).order_by(FounderProjectDB.updated_at.desc())))


def create_project(*, name: str, description: str | None = None) -> FounderProjectDB:
    with SessionLocal() as session:
        record = FounderProjectDB(system_id=FOUNDER_SYSTEM_KEY, name=name.strip(), description=(description or "").strip() or None)
        session.add(record); session.commit(); session.refresh(record)
        return record


def project_counts(project_ids: list[str]) -> dict[str, dict[str, int]]:
    counts = {project_id: {"conversation_count": 0, "candidate_count": 0, "ready_count": 0} for project_id in project_ids}
    if not project_ids: return counts
    with SessionLocal() as session:
        for project_id, count in session.execute(select(ConversationDB.project_id, func.count()).where(ConversationDB.project_id.in_(project_ids), ConversationDB.system_id == FOUNDER_SYSTEM_KEY).group_by(ConversationDB.project_id)):
            counts[project_id]["conversation_count"] = count
        for project_id, status, count in session.execute(select(AssetCatalogDB.project_id, AssetCatalogDB.status, func.count()).where(AssetCatalogDB.project_id.in_(project_ids), AssetCatalogDB.status.in_(["candidate", "ready"])).group_by(AssetCatalogDB.project_id, AssetCatalogDB.status)):
            counts[project_id][f"{status}_count"] = count
    return counts


def update_project(project_id: str, *, name: str | None = None, status: str | None = None) -> FounderProjectDB:
    with SessionLocal() as session:
        record = session.scalar(select(FounderProjectDB).where(FounderProjectDB.id == project_id, FounderProjectDB.system_id == FOUNDER_SYSTEM_KEY))
        if record is None: raise LookupError("Founder project not found")
        if name is not None: record.name = name.strip()
        if status is not None: record.status = status
        record.updated_at = datetime.now(timezone.utc)
        session.commit(); session.refresh(record); return record


def delete_project(project_id: str) -> dict:
    with SessionLocal() as session:
        record = session.scalar(select(FounderProjectDB).where(FounderProjectDB.id == project_id, FounderProjectDB.system_id == FOUNDER_SYSTEM_KEY))
        if record is None: raise LookupError("Founder project not found")
        session.query(ConversationDB).filter_by(project_id=project_id).update({"project_id": None}, synchronize_session=False)
        session.query(AssetCatalogDB).filter_by(project_id=project_id).update({"project_id": None}, synchronize_session=False)
        session.query(ProjectIntelligenceDB).filter_by(project_id=project_id).delete(synchronize_session=False)
        session.delete(record); session.commit()
        return {"project_id": project_id, "deleted": True, "assets_preserved": True}


def get_project(project_id: str) -> FounderProjectDB | None:
    with SessionLocal() as session:
        return session.scalar(select(FounderProjectDB).where(FounderProjectDB.id == project_id, FounderProjectDB.system_id == FOUNDER_SYSTEM_KEY, FounderProjectDB.status.in_(["active", "committed"])))


def _iso(value):
    return value.isoformat() if value else None


def _memory_content(record):
    try:
        return json.loads(record.content)
    except (TypeError, ValueError, json.JSONDecodeError):
        return {"value": record.content}


def _rule_subject(rule: str) -> str:
    normalized = " ".join((rule or "").strip().split())
    for prefix in ("修正规则：", "修正规则:", "修正：", "修正:", "改为：", "改为:"):
        if normalized.startswith(prefix):
            normalized = normalized[len(prefix):].strip()
    for marker in ("必须", "只负责", "点击", "改为", "不再", "不要", "禁止", "应当", "应该", "使用", "采用"):
        if marker in normalized:
            subject = normalized.split(marker, 1)[0].strip("，,:：。 ")
            if subject:
                return subject.lower()
    return normalized[:24].lower()


def _merge_prompt_rules(current: list[str], delta: dict) -> list[str]:
    rules = list(dict.fromkeys(item.strip() for item in current if item and item.strip()))
    deprecated = [item for item in delta.get("deprecated", []) if item]
    revised = [item for item in delta.get("revised", []) if item]
    for change in [*deprecated, *revised]:
        subject = _rule_subject(change)
        if subject:
            rules = [rule for rule in rules if _rule_subject(rule) != subject and subject not in rule.lower()]
    for rule in [*delta.get("added", []), *revised]:
        cleaned = rule.strip()
        if cleaned and cleaned not in rules:
            rules.append(cleaned)
    return rules[-50:]


def get_project_intelligence(project_id: str) -> dict:
    with SessionLocal() as session:
        project = session.get(FounderProjectDB, project_id)
        if project is None or project.system_id != FOUNDER_SYSTEM_KEY:
            raise LookupError("Founder project not found")
        intelligence = session.get(ProjectIntelligenceDB, project_id)
        conversations = list(session.scalars(select(ConversationDB).where(ConversationDB.project_id == project_id, ConversationDB.system_id == FOUNDER_SYSTEM_KEY).order_by(ConversationDB.updated_at.desc())))
        conversation_ids = [item.id for item in conversations]
        decisions = list(session.scalars(select(DecisionAssetDB).where(DecisionAssetDB.conversation_id.in_(conversation_ids)).order_by(DecisionAssetDB.created_at.desc()))) if conversation_ids else []
        questions = list(session.scalars(select(PendingQuestionDB).where(PendingQuestionDB.conversation_id.in_(conversation_ids), PendingQuestionDB.status == "open").order_by(PendingQuestionDB.created_at.desc()))) if conversation_ids else []
        candidates = list(session.scalars(select(CandidateGoalDB).where(CandidateGoalDB.conversation_id.in_(conversation_ids), CandidateGoalDB.status == "candidate").order_by(CandidateGoalDB.created_at.desc()))) if conversation_ids else []
        goals = list(session.scalars(select(GoalAssetDB).where(GoalAssetDB.conversation_id.in_(conversation_ids)).order_by(GoalAssetDB.created_at.desc()))) if conversation_ids else []
        digests = list(session.scalars(select(SecretaryDigestDB).where(SecretaryDigestDB.conversation_id.in_(conversation_ids)).order_by(SecretaryDigestDB.updated_at.desc()))) if conversation_ids else []
        memories = list(session.scalars(select(MemoryAssetDB).where(MemoryAssetDB.conversation_id.in_(conversation_ids)))) if conversation_ids else []
        artifacts = list(session.scalars(select(ArtifactAssetDB).where(ArtifactAssetDB.conversation_id.in_(conversation_ids)))) if conversation_ids else []
        from app.founder_ai.execution_registry import get_execution_session, list_execution_sessions
        execution_refs = []
        for execution in list_execution_sessions():
            stored = get_execution_session(execution.id)
            package = stored[1] if stored else None
            if package and package.task_asset.conversation_id in conversation_ids:
                execution_refs.append({"execution_id": execution.id, "status": execution.status, "task_asset_id": execution.task_asset_id, "goal": package.goal, "execution_allowed": execution.execution_allowed, "updated_at": _iso(execution.completed_at or execution.started_at or execution.created_at)})
        project_summary = intelligence.project_summary if intelligence and intelligence.project_summary else (digests[0].summary if digests else project.description or "")
        prompt_delta = digests[0].prompt_delta if digests else {}
        knowledge = [item for item in memories if item.memory_type == "knowledge" and item.status in {"active", "committed"}]
        active_goals = [item for item in goals if item.status not in {"completed", "archived", "cancelled"}]
        return {
            "project_id": project.id, "project_name": project.name, "project_summary": project_summary,
            "current_positioning": intelligence.current_positioning if intelligence else "",
            "master_prompt": intelligence.master_prompt if intelligence else "",
            "prompt_version": intelligence.prompt_version if intelligence else 1,
            "prompt_delta": prompt_delta or {},
            "decisions": [{"decision_id": item.id, "title": item.title, "content": item.decision, "confirmed": item.confirmed, "created_at": _iso(item.created_at)} for item in decisions],
            "knowledge": [{"memory_id": item.id, "title": item.title, "content": _memory_content(item), "confidence": item.confidence, "source_message_ids": list(item.source_message_ids or []), "created_at": _iso(item.created_at)} for item in knowledge],
            "constraints": list(intelligence.constraints or []) if intelligence else [],
            "terminology": list(intelligence.terminology or []) if intelligence else [],
            "pending_questions": [{"question_id": item.id, "content": item.content, "conversation_id": item.conversation_id, "created_at": _iso(item.created_at)} for item in questions],
            "candidate_goals": [{"goal_id": item.id, "title": item.title, "status": item.status, "conversation_id": item.conversation_id} for item in candidates],
            "active_goals": [{"goal_id": item.id, "title": item.title, "status": item.status, "conversation_id": item.conversation_id} for item in active_goals],
            "completed_goals": [{"goal_id": item.id, "title": item.title, "status": item.status} for item in goals if item.status == "completed"],
            "strategic_assets": [{"artifact_id": item.id, "title": item.title, "type": item.artifact_type} for item in artifacts if item.artifact_type in STRATEGIC_ASSET_TYPES],
            "operating_assets": [{"artifact_id": item.id, "title": item.title, "type": item.artifact_type} for item in artifacts if item.artifact_type not in TECHNICAL_ASSET_TYPES | STRATEGIC_ASSET_TYPES],
            "memory_refs": [item.id for item in memories], "skill_refs": list(intelligence.skill_refs or []) if intelligence else [], "workflow_refs": list(intelligence.workflow_refs or []) if intelligence else [],
            "conversation_refs": [{"conversation_id": item.id, "title": item.title, "updated_at": _iso(item.updated_at), "summary": next((digest.summary for digest in digests if digest.conversation_id == item.id), "")} for item in conversations],
            "execution_refs": execution_refs, "technical_evidence_refs": [item.id for item in artifacts if item.artifact_type in TECHNICAL_ASSET_TYPES],
            "developer_debug": {
                "summary": digests[0].summary if digests else "",
                "knowledge_count": len(knowledge),
                "decision_count": len(decisions),
                "goal_count": len(goals) + len(candidates),
                "pending_question_count": len(questions),
            },
            "updated_at": _iso(intelligence.updated_at if intelligence else project.updated_at),
        }


def assemble_project_context(project_id: str) -> dict:
    """Return a bounded Founder-intelligence context, never raw conversation history."""
    intelligence = get_project_intelligence(project_id)
    return {
        "project_id": intelligence["project_id"],
        "project_name": intelligence["project_name"],
        "master_prompt": intelligence["master_prompt"],
        "prompt_version": intelligence["prompt_version"],
        "confirmed_decisions": [item for item in intelligence["decisions"] if item["confirmed"]][-12:],
        "constraints": intelligence["constraints"][-20:],
        "terminology": intelligence["terminology"][-20:],
        "relevant_knowledge": intelligence["knowledge"][-12:],
        "memory_refs": intelligence["memory_refs"][-20:],
    }


def apply_project_distillation(project_id: str, *, summary: str, viewpoints: list, constraints: list, terminology: list, prompt_delta: dict) -> None:
    with SessionLocal() as session:
        record = session.get(ProjectIntelligenceDB, project_id)
        if record is None:
            record = ProjectIntelligenceDB(project_id=project_id)
            session.add(record)
        record.project_summary = summary
        record.current_positioning = viewpoints[-1] if viewpoints else record.current_positioning
        revision_subjects = {_rule_subject(item) for item in [*prompt_delta.get("revised", []), *prompt_delta.get("deprecated", [])] if item}
        retained_constraints = [item for item in (record.constraints or []) if _rule_subject(item) not in revision_subjects]
        incoming_constraints = [item for item in constraints if _rule_subject(item) not in revision_subjects or item in prompt_delta.get("revised", [])]
        record.constraints = list(dict.fromkeys([*retained_constraints, *incoming_constraints]))[-30:]
        record.terminology = list(dict.fromkeys([*(record.terminology or []), *terminology]))[-30:]
        previous_rules = list(record.prompt_rules or [])
        next_rules = _merge_prompt_rules(previous_rules, prompt_delta)
        if next_rules != previous_rules:
            previous = record.master_prompt
            prompt_lines = [f"Project: {session.get(FounderProjectDB, project_id).name}", *[f"- {item}" for item in next_rules]]
            next_prompt = "\n".join(item for item in prompt_lines if item).strip()
            if next_prompt and next_prompt != previous:
                if previous:
                    record.prompt_history = [*(record.prompt_history or []), {"version": record.prompt_version, "content": previous, "replaced_at": datetime.now(timezone.utc).isoformat()}][-20:]
                    record.prompt_version += 1
                record.master_prompt = next_prompt
                record.prompt_rules = next_rules
        record.updated_at = datetime.now(timezone.utc)
        session.commit()
