"""Provider-backed Founder Intent Engine and reviewed Object mutations."""
from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
import json
import logging
import re
from typing import Any, Callable

from sqlalchemy import select

from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import ConversationMessageDB, SecretaryDigestDB
from app.core.founder_object.service import OBJECT_TYPES, _display, _normalize_name
from app.core.model_center.service import resolve_runtime_config
from app.database.db import SessionLocal
from app.llm.gateway import llm_gateway
from app.llm.models import LLMRequest
from core.founder_intent.model import ConversationCandidateContextDB, FounderIntentRunDB, FounderObjectCandidateDB
from core.founder_object.model import ConversationObjectContextDB, FounderObjectDB, FounderObjectRevisionDB

logger = logging.getLogger(__name__)
INTENT_TYPES = {"create", "modify", "merge", "split", "delay", "approve", "reject", "archive", "reference_existing"}
CANDIDATE_KIND = {"create": "create_object", "modify": "modify_object", "merge": "merge_objects", "split": "split_object", "delay": "status_change", "approve": "status_change", "reject": "status_change", "archive": "status_change", "reference_existing": "reference_existing"}
MVP_CONFIDENCE_THRESHOLD = 0.65
MVP_CANDIDATE_TYPES = {"TASK", "DECISION"}
MATERIALIZABLE_CANDIDATE_TYPES = {"DECISION": "decision", "TASK": "task"}


def _iso(value): return value.isoformat() if value else None


def _candidate_display(row: FounderObjectCandidateDB) -> dict:
    mutation_result = dict(row.mutation_result or {})
    proposed_patch = dict(row.proposed_patch or {})
    refs = list(row.source_message_refs or [])
    candidate_type = proposed_patch.get("candidate_type")
    if not candidate_type:
        candidate_type = "DECISION" if row.proposed_object_type == "decision" else "TASK" if row.proposed_object_type == "task" else (row.proposed_object_type or "").upper()
    return {"candidate_id": row.id, "intent_id": row.intent_id, "conversation_id": row.conversation_id, "candidate_kind": row.candidate_kind, "intent_type": row.intent_type, "candidate_type": candidate_type, "source_message_id": refs[0] if refs else None, "target_object_id": row.target_object_id, "target_object_ids": list(row.target_object_ids or []), "proposed_object_type": row.proposed_object_type, "proposed_name": row.proposed_name, "proposed_description": row.proposed_description, "proposed_status": row.proposed_status, "proposed_patch": proposed_patch, "relation_changes": list(row.relation_changes or []), "reason": row.reason, "confidence": row.confidence, "source_message_refs": refs, "review_status": row.review_status, "review_action": mutation_result.get("review_action"), "mutation_result": mutation_result, "created_at": _iso(row.created_at), "reviewed_at": _iso(row.reviewed_at)}


def _candidate_type(row: FounderObjectCandidateDB) -> str:
    proposed_patch = dict(row.proposed_patch or {})
    candidate_type = str(proposed_patch.get("candidate_type") or "").upper().strip()
    if candidate_type:
        return candidate_type
    if row.proposed_object_type == "decision":
        return "DECISION"
    if row.proposed_object_type == "task":
        return "TASK"
    return str(row.proposed_object_type or "").upper().strip()


class IntentContextBuilder:
    def build(self, conversation_id: str, trigger_message_id: str, founder_message: str) -> dict:
        with SessionLocal() as session:
            conversation = session.get(ConversationDB, conversation_id)
            if not conversation or conversation.system_id != "founder_ai": raise LookupError("Founder AI conversation not found")
            messages = list(reversed(list(session.scalars(select(ConversationMessageDB).where(ConversationMessageDB.conversation_id == conversation_id).order_by(ConversationMessageDB.created_at.desc()).limit(12)))))
            object_context = session.get(ConversationObjectContextDB, conversation_id)
            active = session.get(FounderObjectDB, object_context.object_id) if object_context else None
            referenced_ids = {active.id} if active else set()
            pending = list(session.scalars(select(FounderObjectCandidateDB).where(FounderObjectCandidateDB.conversation_id == conversation_id, FounderObjectCandidateDB.review_status == "pending").order_by(FounderObjectCandidateDB.created_at.desc()).limit(12)))
            for item in pending:
                referenced_ids.update(item.target_object_ids or [])
                if item.target_object_id: referenced_ids.add(item.target_object_id)
            scope = conversation.project_id or "founder_ai"
            objects = list(session.scalars(select(FounderObjectDB).where(FounderObjectDB.status != "archived", FounderObjectDB.scope_key.in_([scope, "founder_ai"])).order_by(FounderObjectDB.updated_at.desc()).limit(40)))
            digest = session.scalar(select(SecretaryDigestDB).where(SecretaryDigestDB.conversation_id == conversation_id))
            return {"conversation_id": conversation_id, "trigger_message_id": trigger_message_id, "founder_message": founder_message, "recent_messages": [{"message_id": m.id, "role": m.role, "content": m.content} for m in messages], "conversation_summary": digest.summary if digest else "", "project_id": conversation.project_id, "active_context_object": _display(active) if active else None, "conversation_objects": [_display(o) for o in objects if o.id in referenced_ids or o.source_conversation_id == conversation_id], "existing_objects": [_display(o) for o in objects], "pending_candidates": [_candidate_display(c) for c in pending]}


class EntityResolver:
    def resolve(self, intent: dict, context: dict) -> tuple[dict, list[dict]]:
        objects = context["existing_objects"]
        requested_id = str((intent.get("target_object") or {}).get("object_id") or intent.get("target_object_id") or "").strip()
        requested_name = str((intent.get("target_object") or {}).get("name") or intent.get("target_object_name") or "").strip()
        candidates = []
        active = context.get("active_context_object")
        if requested_id:
            candidates = [item for item in objects if item["object_id"] == requested_id]
        elif active and (not requested_name or any(token in context["founder_message"] for token in ("这个", "它", "当前", "该"))):
            candidates = [active]
        elif requested_name:
            exact = [item for item in objects if _normalize_name(item["name"]) == _normalize_name(requested_name)]
            candidates = exact or [item for item in objects if _normalize_name(requested_name) in _normalize_name(item["name"]) or _normalize_name(item["name"]) in _normalize_name(requested_name)]
        if len(candidates) == 1:
            intent["target_object_id"] = candidates[0]["object_id"]
            intent["target_object_type"] = candidates[0]["object_type"]
            intent["target_object_name"] = candidates[0]["name"]
        elif intent.get("intent_type") != "create":
            intent["ambiguities"] = ["无法唯一确认目标对象"]
            intent["requires_review"] = True
        return intent, candidates


def _extract_json(content: str) -> dict:
    text = str(content or "").strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.I)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < start: raise ValueError("intent_json_missing")
    value = json.loads(text[start:end + 1])
    if not isinstance(value, dict) or not isinstance(value.get("intents", []), list): raise ValueError("intent_schema_invalid")
    return value


def _fingerprint(conversation_id: str, intent: dict, refs: list[str]) -> str:
    evidence_key = refs[0] if refs else ""
    payload = {"conversation_id": conversation_id, "target": intent.get("target_object_id") or _normalize_name(intent.get("proposed_name") or ""), "intent": intent["intent_type"], "candidate_type": intent.get("candidate_type"), "patch": intent.get("proposed_patch") or {}, "relations": intent.get("relation_changes") or [], "evidence": evidence_key}
    return sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def _clean_title(text: str, fallback: str) -> str:
    title = re.sub(r"[。！？!?]+$", "", str(text or "").strip())
    title = re.sub(r"^(我们|我|现在|就|应该|需要|决定|确定|第一阶段|先)+", "", title).strip(" ：:，,")
    return (title or fallback)[:120]


def _mvp_candidate_from_text(context: dict) -> dict:
    text = str(context.get("founder_message") or "").strip()
    if not text:
        return {"intents": []}
    lowered = text.lower()
    discussion_markers = ("未来会怎么发展", "怎么看", "如何看待", "聊聊", "讨论一下", "是什么", "为什么")
    if any(marker in lowered for marker in discussion_markers) and not any(marker in lowered for marker in ("应该做", "需要做", "现在就", "第一阶段", "只支持", "决定", "确定")):
        return {"intents": []}
    decision_markers = ("第一阶段", "只支持", "先支持", "决定", "确定", "边界是", "范围是", "原则是")
    task_markers = ("应该做", "需要做", "做一个", "做出来", "开发", "实现", "构建", "生成", "agent", "任务")
    if any(marker in lowered for marker in decision_markers):
        title = _clean_title(text, "Founder Decision")
        return {"intents": [{"intent_type": "create", "candidate_type": "DECISION", "proposed_object_type": "decision", "proposed_name": title, "proposed_description": text, "proposed_patch": {"candidate_type": "DECISION", "summary": text}, "reason": "Founder 明确表达了产品阶段、范围或原则决策。", "confidence": 0.86, "source_message_refs": [context["trigger_message_id"]]}]}
    if any(marker in lowered for marker in task_markers):
        title = _clean_title(text, "Founder Task Candidate")
        return {"intents": [{"intent_type": "create", "candidate_type": "TASK", "proposed_object_type": "task", "proposed_name": title, "proposed_description": text, "proposed_patch": {"candidate_type": "TASK", "summary": text}, "reason": "Founder 表达了可进入后续生命周期的明确目标或任务意图。", "confidence": 0.82, "source_message_refs": [context["trigger_message_id"]]}]}
    return {"intents": []}


class FounderIntentEngine:
    def __init__(self, generator: Callable[[dict], tuple[dict, str | None, str | None]] | None = None):
        self.context_builder = IntentContextBuilder(); self.resolver = EntityResolver(); self.generator = generator or self._mvp_recognize

    def run(self, conversation_id: str, trigger_message_id: str, founder_message: str) -> list[dict]:
        context = self.context_builder.build(conversation_id, trigger_message_id, founder_message)
        run = FounderIntentRunDB(conversation_id=conversation_id, trigger_message_id=trigger_message_id, active_context_object_id=(context.get("active_context_object") or {}).get("object_id"))
        with SessionLocal() as session: session.add(run); session.commit(); session.refresh(run); run_id = run.id
        try:
            output, provider, model = self.generator(context)
            normalized = []
            for raw in output.get("intents", []):
                intent_type = str(raw.get("intent_type", "")).lower().strip()
                if intent_type not in INTENT_TYPES: continue
                confidence = max(0, min(1, float(raw.get("confidence") or 0)))
                if confidence < MVP_CONFIDENCE_THRESHOLD: continue
                item = {**raw, "intent_type": intent_type, "requires_review": True}
                item["candidate_type"] = str(item.get("candidate_type") or "").upper().strip()
                target = item.get("target_object") if isinstance(item.get("target_object"), dict) else {}
                item["target_object_name"] = item.get("target_object_name") or target.get("name")
                item["target_object_id"] = item.get("target_object_id") or target.get("object_id")
                item["proposed_name"] = item.get("proposed_name") or item.get("target_object_name")
                if item["candidate_type"] and item["candidate_type"] not in MVP_CANDIDATE_TYPES:
                    continue
                if item["candidate_type"]:
                    item["proposed_patch"] = {"candidate_type": item["candidate_type"], **(item.get("proposed_patch") or {})}
                if intent_type == "delay":
                    item["proposed_status"] = item.get("proposed_status") or "deferred"
                    item["proposed_patch"] = {"status": item["proposed_status"], **(item.get("proposed_patch") or {})}
                item, entity_candidates = self.resolver.resolve(item, context)
                item["entity_candidates"] = [candidate["object_id"] for candidate in entity_candidates]
                normalized.append(item)
            with SessionLocal() as session:
                record = session.get(FounderIntentRunDB, run_id); record.runtime_provider = provider; record.runtime_model = model; record.parse_status = "completed"; record.output = {"intents": normalized}; session.commit()
            return self._persist_candidates(run_id, context, normalized)
        except Exception as error:
            logger.warning("Founder Intent Engine failed conversation=%s trigger=%s error=%s", conversation_id, trigger_message_id, type(error).__name__)
            with SessionLocal() as session:
                record = session.get(FounderIntentRunDB, run_id); record.parse_status = "failed"; record.error_type = type(error).__name__; session.commit()
            return list_candidates(conversation_id)

    def _persist_candidates(self, run_id: str, context: dict, intents: list[dict]) -> list[dict]:
        with SessionLocal() as session:
            for intent in intents:
                refs = list(dict.fromkeys(intent.get("source_message_refs") or [context["trigger_message_id"]]))
                fingerprint = _fingerprint(context["conversation_id"], intent, refs)
                existing = session.scalar(select(FounderObjectCandidateDB).where(FounderObjectCandidateDB.fingerprint == fingerprint))
                if existing:
                    existing.intent_id = run_id; existing.reason = str(intent.get("reason") or existing.reason); existing.confidence = float(intent.get("confidence") or existing.confidence); existing.proposed_name = intent.get("proposed_name") or existing.proposed_name; existing.proposed_status = intent.get("proposed_status") or existing.proposed_status; existing.proposed_patch = intent.get("proposed_patch") or existing.proposed_patch; existing.relation_changes = intent.get("relation_changes") or existing.relation_changes
                    continue
                target_id = intent.get("target_object_id")
                row = FounderObjectCandidateDB(intent_id=run_id, conversation_id=context["conversation_id"], candidate_kind=CANDIDATE_KIND[intent["intent_type"]], intent_type=intent["intent_type"], target_object_id=target_id, target_object_ids=intent.get("target_object_ids") or ([target_id] if target_id else []), proposed_object_type=intent.get("proposed_object_type") or intent.get("target_object_type"), proposed_name=intent.get("proposed_name") or intent.get("target_object_name"), proposed_description=str(intent.get("proposed_description") or ""), proposed_status=intent.get("proposed_status"), proposed_patch=intent.get("proposed_patch") or {}, relation_changes=intent.get("relation_changes") or [], reason=str(intent.get("reason") or ""), confidence=max(0, min(1, float(intent.get("confidence") or 0))), source_message_refs=refs, fingerprint=fingerprint)
                session.add(row)
            session.commit()
        return list_candidates(context["conversation_id"])

    @staticmethod
    def _mvp_recognize(context: dict) -> tuple[dict, str | None, str | None]:
        return _mvp_candidate_from_text(context), "deterministic", "founder-intent-mvp"

    @staticmethod
    def _provider_recognize(context: dict) -> tuple[dict, str | None, str | None]:
        runtime = resolve_runtime_config(role="sino_conversation")
        if runtime is None: raise RuntimeError("intent_runtime_unavailable")
        compact_objects = [{key: item.get(key) for key in ("object_id", "object_type", "name", "description", "status", "version", "parent_object_id", "dependency_object_ids", "related_object_ids")} for item in context["existing_objects"]]
        payload = {**context, "existing_objects": compact_objects}
        request = LLMRequest(system_prompt="你是 Founder Intent Engine。根据完整对话语义识别系统对象意图，不要求固定句式。可用 intent_type: create, modify, merge, split, delay, approve, reject, archive, reference_existing。优先解析现有 object_id；不确定时保留 ambiguities，禁止猜测或自动批准。只返回 JSON：{intents:[{intent_type,target_object:{object_id,name},target_object_ids,proposed_object_type,proposed_name,proposed_description,proposed_status,proposed_patch,relation_changes,reason,confidence,source_message_refs,ambiguities}]}。没有真实对象意图返回空 intents。", user_prompt=json.dumps(payload, ensure_ascii=False), temperature=0.1, max_tokens=1400, response_format="json", metadata={"runtime_role": "founder_intent_engine", "assignment_role": "sino_conversation", "conversation_id": context["conversation_id"], "invocation_source": "founder_intent", "runtime_mode": "default", "trigger_message_id": context["trigger_message_id"]})
        response = llm_gateway.generate_for_model(runtime.provider_key, runtime.model, request)
        return _extract_json(response.content), response.provider, response.model


intent_engine = FounderIntentEngine()


def list_candidates(conversation_id: str, include_reviewed: bool = True) -> list[dict]:
    with SessionLocal() as session:
        query = select(FounderObjectCandidateDB).where(FounderObjectCandidateDB.conversation_id == conversation_id)
        if not include_reviewed: query = query.where(FounderObjectCandidateDB.review_status == "pending")
        return [_candidate_display(row) for row in session.scalars(query.order_by(FounderObjectCandidateDB.created_at.desc()))]


def get_candidate(candidate_id: str) -> dict | None:
    with SessionLocal() as session:
        row = session.get(FounderObjectCandidateDB, candidate_id)
        return _candidate_display(row) if row else None


def attach_candidate_context(candidate_id: str, conversation_id: str) -> dict:
    with SessionLocal() as session:
        candidate = session.get(FounderObjectCandidateDB, candidate_id); conversation = session.get(ConversationDB, conversation_id)
        if not candidate or not conversation or conversation.system_id != "founder_ai": raise LookupError("Founder Candidate or Conversation not found")
        binding = session.get(ConversationCandidateContextDB, conversation_id)
        if binding: binding.candidate_id = candidate_id; binding.attached_at = datetime.now(timezone.utc)
        else: session.add(ConversationCandidateContextDB(conversation_id=conversation_id, candidate_id=candidate_id))
        session.commit(); return _candidate_display(candidate)


def get_conversation_candidate_context(conversation_id: str) -> dict | None:
    with SessionLocal() as session:
        binding = session.get(ConversationCandidateContextDB, conversation_id)
        row = session.get(FounderObjectCandidateDB, binding.candidate_id) if binding else None
        if binding and not row:
            session.delete(binding)
            session.commit()
            return None
        return _candidate_display(row) if row else None


def _materialize_confirmed_candidate(session, candidate: FounderObjectCandidateDB) -> dict | None:
    candidate_type = _candidate_type(candidate)
    object_type = MATERIALIZABLE_CANDIDATE_TYPES.get(candidate_type)
    if candidate.intent_type != "create" or not object_type:
        return None
    if object_type not in OBJECT_TYPES or not candidate.proposed_name:
        return None
    existing = session.scalar(select(FounderObjectDB).where(FounderObjectDB.source_candidate_id == candidate.id))
    conversation = session.get(ConversationDB, candidate.conversation_id)
    scope = conversation.project_id if conversation and conversation.project_id else "founder_ai"
    if existing is None:
        existing = session.scalar(select(FounderObjectDB).where(FounderObjectDB.object_type == object_type, FounderObjectDB.normalized_name == _normalize_name(candidate.proposed_name), FounderObjectDB.scope_key == scope))
        if existing and not existing.source_candidate_id:
            existing.source_candidate_id = candidate.id
            existing.source_conversation_id = existing.source_conversation_id or candidate.conversation_id
            existing.source_message_refs = list(dict.fromkeys([*list(existing.source_message_refs or []), *list(candidate.source_message_refs or [])]))
            existing.updated_at = datetime.now(timezone.utc)
    if existing is None:
        existing = FounderObjectDB(object_type=object_type, name=candidate.proposed_name, normalized_name=_normalize_name(candidate.proposed_name), description=candidate.proposed_description, status="draft", scope_key=scope, source_candidate_id=candidate.id, source_conversation_id=candidate.conversation_id, source_message_refs=list(candidate.source_message_refs or []))
        session.add(existing); session.flush()
        session.add(FounderObjectRevisionDB(object_id=existing.id, version=1, name=existing.name, description=existing.description, status=existing.status, source_conversation_id=existing.source_conversation_id, source_message_refs=list(existing.source_message_refs or []), snapshot=_display(existing)))
    return {"object_id": existing.id, "object_type": existing.object_type, "object_version": existing.version, "materialization_action": "create_or_reuse", "materialization_status": existing.status}


def review_candidate(candidate_id: str, action: str) -> dict:
    normalized_action = "confirm" if action == "approve" else action
    if normalized_action not in {"confirm", "reject"}: raise ValueError("invalid candidate review action")
    with SessionLocal() as session:
        candidate = session.get(FounderObjectCandidateDB, candidate_id)
        if not candidate: raise LookupError("Founder Candidate not found")
        if candidate.review_status != "pending":
            return _candidate_display(candidate)
        now = datetime.now(timezone.utc)
        if normalized_action == "reject":
            candidate.review_status = "rejected"; candidate.reviewed_at = now
            candidate.mutation_result = {**dict(candidate.mutation_result or {}), "review_action": "reject", "candidate_confirmed": False}
            session.commit(); return _candidate_display(candidate)
        # MVP safety boundary: candidate confirmation can materialize a draft
        # FounderObject for reviewed create intents, but it is not object
        # approval and must not create TaskAsset, create Execution, or call
        # approve_object(). Later lifecycle actions own those transitions.
        candidate.review_status = "confirmed"; candidate.reviewed_at = now
        materialized = _materialize_confirmed_candidate(session, candidate)
        candidate.mutation_result = {**dict(candidate.mutation_result or {}), "review_action": "confirm", "candidate_confirmed": True, "object_mutation_performed": bool(materialized), "task_asset_created": False, "execution_created": False, **(materialized or {"materialization_status": "not_supported"})}
        session.commit(); return _candidate_display(candidate)


def _add_revision(session, record: FounderObjectDB):
    session.add(FounderObjectRevisionDB(object_id=record.id, version=record.version, name=record.name, description=record.description, status=record.status, source_conversation_id=record.source_conversation_id, source_message_refs=list(record.source_message_refs or []), snapshot=_display(record)))


def _apply_mutation(session, candidate: FounderObjectCandidateDB) -> dict:
    now = datetime.now(timezone.utc); intent = candidate.intent_type
    if intent == "create":
        object_type = candidate.proposed_object_type
        if object_type not in OBJECT_TYPES or not candidate.proposed_name: raise ValueError("invalid create candidate")
        conversation = session.get(ConversationDB, candidate.conversation_id); scope = conversation.project_id or "founder_ai"
        existing = session.scalar(select(FounderObjectDB).where(FounderObjectDB.object_type == object_type, FounderObjectDB.normalized_name == _normalize_name(candidate.proposed_name), FounderObjectDB.scope_key == scope))
        if existing: record = existing
        else:
            record = FounderObjectDB(object_type=object_type, name=candidate.proposed_name, normalized_name=_normalize_name(candidate.proposed_name), description=candidate.proposed_description, status="draft", scope_key=scope, source_candidate_id=candidate.id, source_conversation_id=candidate.conversation_id, source_message_refs=list(candidate.source_message_refs or [])); session.add(record); session.flush(); session.add(FounderObjectRevisionDB(object_id=record.id, version=1, name=record.name, description=record.description, status=record.status, source_conversation_id=record.source_conversation_id, source_message_refs=list(record.source_message_refs or []), snapshot=_display(record)))
    else:
        record = session.get(FounderObjectDB, candidate.target_object_id) if candidate.target_object_id else None
        if not record: raise ValueError("candidate target is unresolved")
        if intent in {"modify", "delay", "archive"}:
            _add_revision(session, record); record.version += 1
            patch = dict(candidate.proposed_patch or {})
            if candidate.proposed_description or patch.get("description"): record.description = candidate.proposed_description or str(patch["description"])
            if patch.get("name"): record.name = str(patch["name"]); record.normalized_name = _normalize_name(record.name)
            if intent == "delay": record.status = candidate.proposed_status or "deferred"
            elif intent == "archive": record.status = "archived"
            elif candidate.proposed_status: record.status = candidate.proposed_status
            record.source_conversation_id = candidate.conversation_id; record.source_message_refs = list(dict.fromkeys([*list(record.source_message_refs or []), *list(candidate.source_message_refs or [])])); record.updated_at = now
        elif intent == "reference_existing":
            pass
        elif intent == "merge":
            sources = [session.get(FounderObjectDB, item) for item in candidate.target_object_ids]
            sources = [item for item in sources if item]
            if len(sources) < 2: raise ValueError("merge requires two resolved objects")
            record = sources[0]; _add_revision(session, record); record.version += 1
            for merged in sources[1:]:
                record.child_object_ids = list(dict.fromkeys([*list(record.child_object_ids or []), *list(merged.child_object_ids or [])]))
                record.dependency_object_ids = list(dict.fromkeys([*list(record.dependency_object_ids or []), *list(merged.dependency_object_ids or [])]))
                record.related_object_ids = list(dict.fromkeys([*list(record.related_object_ids or []), merged.id, *list(merged.related_object_ids or [])]))
                _add_revision(session, merged); merged.version += 1; merged.status = "archived"; merged.related_object_ids = list(dict.fromkeys([*list(merged.related_object_ids or []), record.id])); merged.updated_at = now
            record.updated_at = now
        elif intent == "split":
            children = list((candidate.proposed_patch or {}).get("children") or [])
            if len(children) < 2: raise ValueError("split requires at least two children")
            _add_revision(session, record); record.version += 1
            for child in children:
                object_type, name = child.get("object_type") or record.object_type, str(child.get("name") or "").strip()
                if object_type not in OBJECT_TYPES or not name: continue
                created = FounderObjectDB(object_type=object_type, name=name, normalized_name=_normalize_name(name), description=str(child.get("description") or ""), status="draft", scope_key=record.scope_key, source_conversation_id=candidate.conversation_id, source_message_refs=list(candidate.source_message_refs or []), parent_object_id=record.id, related_object_ids=[record.id]); session.add(created); session.flush(); record.child_object_ids = list(dict.fromkeys([*list(record.child_object_ids or []), created.id]))
            record.updated_at = now
    for change in candidate.relation_changes or []:
        source = session.get(FounderObjectDB, change.get("source_object_id") or record.id); target = session.get(FounderObjectDB, change.get("target_object_id"))
        if not source or not target: continue
        relation = change.get("relation_type")
        if relation in {"dependency", "depends_on"}: source.dependency_object_ids = list(dict.fromkeys([*list(source.dependency_object_ids or []), target.id]))
        elif relation == "parent_child": source.child_object_ids = list(dict.fromkeys([*list(source.child_object_ids or []), target.id])); target.parent_object_id = source.id
        else: source.related_object_ids = list(dict.fromkeys([*list(source.related_object_ids or []), target.id])); target.related_object_ids = list(dict.fromkeys([*list(target.related_object_ids or []), source.id]))
    session.flush()
    return {"object_id": record.id, "version": record.version, "status": record.status, "intent_type": intent}
