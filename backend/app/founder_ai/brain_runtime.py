"""Sino Brain V1 lifecycle orchestration.

This layer owns clarification and decision state. It deliberately does not
execute code or mutate formal Founder Objects.
"""
from __future__ import annotations

from datetime import datetime, timezone
import json
import re
from typing import Any
from uuid import uuid4

from sqlalchemy import select

from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import ConversationMessageDB, SinoBrainSessionDB
from app.core.asset_lifecycle.model import AssetCatalogDB
from app.core.product_visibility.service import is_product_hidden
from app.core.asset_lifecycle.service import LifecycleConflict, capability_available_actions, perform_capability_action, suggest_reuse, upsert_catalog_record
from app.core.decision.model import DecisionAssetDB
from app.core.memory.model import MemoryAssetDB
from app.core.project.model import FounderProjectDB
from app.database.db import SessionLocal
from app.llm.gateway import llm_gateway
from app.llm.models import LLMRequest
from core.founder_object.model import FounderObjectDB, FounderObjectRevisionDB


STAGES = (
    "goal_discovery", "goal_review", "goal_confirmed", "strategy_meeting",
    "conflict_validation", "decision_ready", "package_ready", "package_approved",
    "asset_commit", "conversation_completed",
)
WORKSPACE_STAGES = ("goal", "strategy", "validation", "decision", "package", "asset_commit")
STAGE_LABELS = {
    "goal": "Goal Understanding", "strategy": "Strategy Meeting", "validation": "Validation",
    "decision": "Decision", "package": "Discussion Package", "asset_commit": "Asset Commit",
}


def _iso(value):
    return value.isoformat() if value else None


def _id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:20]}"


class SinoBrainRuntime:
    """Conversation-scoped Brain state machine with explicit Founder gates."""

    MAX_CLARIFICATION_ROUNDS = 3

    def __init__(self, *, understanding_runner=None, lifecycle_intent_runner=None):
        self._understanding_runner = understanding_runner or self._provider_understanding
        self._lifecycle_intent_runner = lifecycle_intent_runner or self._provider_lifecycle_intent

    def snapshot(self, conversation_id: str) -> dict[str, Any] | None:
        with SessionLocal() as session:
            record = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
            if not record:
                return None
            payload = self._serialize(record)
            messages = list(session.scalars(select(ConversationMessageDB).where(
                ConversationMessageDB.conversation_id == conversation_id
            ).order_by(ConversationMessageDB.created_at)))
            refs = {key: [] for key in WORKSPACE_STAGES}
            for message in messages:
                key = self._message_stage(message, payload["active_workspace_stage"])
                refs[key].append(message.id)
            for workspace in payload["stage_workspaces"]:
                workspace["message_refs"] = refs[workspace["stage_key"]]
            return payload

    def process_message(self, conversation_id: str, content: str) -> dict[str, Any]:
        """Use Sino's configured model to understand a goal; rules only validate."""
        with SessionLocal() as session:
            conversation = session.get(ConversationDB, conversation_id)
            if conversation is None or conversation.system_id != "founder_ai":
                raise LookupError("Founder AI conversation not found")
            state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
            if state is None:
                state = SinoBrainSessionDB(conversation_id=conversation_id, project_id=conversation.project_id)
                session.add(state); session.flush()
            reuse_turn = self._process_reuse_message(session, conversation, state, content)
            if reuse_turn:
                return reuse_turn
            if state.stage in {"asset_commit", "conversation_completed"} and (state.discussion_package or {}).get("objects"):
                lifecycle_turn = self._process_lifecycle_message(session, conversation, state, content)
                if lifecycle_turn:
                    return lifecycle_turn
            if state.stage not in {"goal_discovery", "goal_review"}:
                return {"handled": False, "brain": self._serialize(state)}
            if state.stage == "goal_review" and self.review_intent(content) == "confirm_goal":
                state.stage = "strategy_meeting"
                state.goal_readiness = "confirmed"
                conversation.conversation_state = "strategy_meeting"
                state.updated_at = datetime.now(timezone.utc)
                session.commit()
                return {
                    "handled": True,
                    "reply": "目标已确认。现在开始围绕这份 Goal Brief 组织 Strategy Meeting。",
                    "message_type": "strategy_meeting",
                    "action": "confirm_goal",
                    "brain": self._serialize(state),
                }

            discovery = dict(state.discovery or {})
            turns = list(discovery.get("founder_inputs") or discovery.get("answers") or [])
            turns.append(content.strip())
            discovery["founder_inputs"] = turns
            discovery.setdefault("original_goal", content.strip())
            context = self._build_understanding_context(session, conversation, state, content.strip(), turns)
            try:
                raw = self._understanding_runner(context)
                understanding = self._validate_understanding(raw, clarification_rounds=max(0, len(turns) - 1))
            except Exception as error:
                discovery.update({"understanding_status": "unavailable", "understanding_error": type(error).__name__})
                state.discovery = discovery
                state.updated_at = datetime.now(timezone.utc)
                session.commit()
                return {
                    "handled": True,
                    "reply": "目标理解暂时不可用，我没有用固定问卷代替模型判断。你刚才的内容已保留，请稍后重试。",
                    "message_type": "goal_understanding_error",
                    "brain": self._serialize(state),
                }

            discovery.update({
                "working_understanding": understanding,
                "clarification_rounds": max(0, len(turns) - 1),
                "understanding_status": "ready",
                "provider": understanding.pop("_provider", None),
                "model": understanding.pop("_model", None),
                "context_sources": context["context_sources"],
            })
            state.updated_at = datetime.now(timezone.utc)
            state.goal_brief = understanding.get("goal_brief_draft") or state.goal_brief
            if understanding["readiness"] == "discovering":
                state.stage = "goal_discovery"
                state.goal_readiness = "discovering"
                discovery["current_question"] = understanding["next_question"]
                state.discovery = discovery
                reply = self._understanding_reply(understanding, include_question=True)
                message_type = "goal_understanding"
            else:
                state.stage = "goal_review"
                state.goal_readiness = "reviewable"
                discovery.pop("current_question", None)
                state.discovery = discovery
                reply = self._understanding_reply(understanding, include_question=False)
                message_type = "goal_brief"
                business_title = str((state.goal_brief or {}).get("goal") or "").strip().rstrip("。！？?!")
                if business_title:
                    conversation.title = business_title[:80]
            session.commit()
            return {"handled": True, "reply": reply, "message_type": message_type, "brain": self._serialize(state)}

    def _process_lifecycle_message(self, session, conversation, state, content):
        package = dict(state.discussion_package or {})
        asset_ids = [item.get("asset_id") for item in package.get("objects") or [] if item.get("asset_id")]
        records = list(session.scalars(select(AssetCatalogDB).where(AssetCatalogDB.id.in_(asset_ids))))
        if not records:
            return None
        context = {
            "founder_message": content,
            "selected_asset_id": package.get("selected_asset_id"),
            "assets": [{
                "asset_id": item.id, "type": item.asset_type, "name": item.name,
                "status": item.status, "available_actions": capability_available_actions(item),
            } for item in records],
        }
        try:
            intent = self._lifecycle_intent_runner(context)
        except Exception:
            lifecycle_terms = ("开发", "测试", "批准", "可引用", "引用", "暂不", "保留", "归档", "重测")
            if any(term in content for term in lifecycle_terms):
                return {"handled": True, "reply": "能力生命周期指令理解暂不可用。当前状态没有改变；你可以稍后重试或使用同一 Action Card。", "message_type": "capability_lifecycle_error", "brain": self._serialize(state)}
            return None
        action = str(intent.get("action") or "continue_discussion")
        if float(intent.get("confidence") or 0) < .65:
            return {"handled": True, "reply": "我还不能可靠判断你要操作哪项能力。请说出能力名称和动作，例如“先开发商品分镜 Skill”。", "message_type": "capability_lifecycle", "brain": self._serialize(state)}
        if action == "continue_discussion":
            return None
        target = self._resolve_lifecycle_target(records, package.get("selected_asset_id"), intent, content)
        if target is None:
            return {"handled": True, "reply": "我理解了你的生命周期指令，但当前目标对象不够明确。请直接说出能力名称，例如“先开发商品分镜 Skill”。", "message_type": "capability_lifecycle", "brain": self._serialize(state)}
        package["selected_asset_id"] = target.id
        package["selected_asset_type"] = target.asset_type
        package["selected_asset_name"] = target.name
        state.discussion_package = package
        conversation.conversation_state = "active"
        state.updated_at = datetime.now(timezone.utc)
        session.commit()
        if action in {"defer", "skip_reuse"}:
            reply = f"已保留 {target.name} 当前状态（{target.status}），不会自动推进。"
        else:
            service_action = "retest" if action == "run_test" and "retest" in capability_available_actions(target) else action
            try:
                result = perform_capability_action(
                    target.id, service_action,
                    target_type="conversation" if action == "reuse" else None,
                    target_id=conversation.id if action == "reuse" else None,
                    note="Founder 通过 Sino 自然语言确认",
                )
            except LifecycleConflict as error:
                return {"handled": True, "reply": f"暂时不能执行这个动作：{error.detail['message']}。当前可执行：{'、'.join(error.detail['available_actions']) or '继续讨论'}。", "message_type": "capability_lifecycle", "action": action, "target_asset_id": target.id, "brain": self.snapshot(conversation.id)}
            asset = result.get("asset") if isinstance(result, dict) and result.get("asset") else result
            status = asset.get("status") if isinstance(asset, dict) else target.status
            reply = self._lifecycle_reply(action, target.name, status, result)
        return {"handled": True, "reply": reply, "message_type": "capability_lifecycle", "action": action, "target_asset_id": target.id, "brain": self.snapshot(conversation.id)}

    def _process_reuse_message(self, session, conversation, state, content):
        """Resolve a Ready capability reference in any Brain stage.

        The lexical check is only a guardrail that avoids an extra provider call
        for ordinary discussion. The provider remains the intent driver.
        """
        if not any(term in content for term in ("引用", "不引用", "不用这个")):
            return None
        suggestions = [item for item in suggest_reuse(conversation.id) if item.get("can_reuse")]
        if not suggestions:
            return None
        context = {
            "founder_message": content,
            "selected_asset_id": suggestions[0]["asset_id"] if len(suggestions) == 1 else None,
            "assets": [{
                "asset_id": item["asset_id"], "type": item["asset_type"], "name": item["name"],
                "status": item["status"], "available_actions": item.get("available_actions") or ["reuse"],
            } for item in suggestions],
        }
        try:
            intent = self._lifecycle_intent_runner(context)
        except Exception:
            return {"handled": True, "reply": "能力引用指令理解暂不可用，当前没有建立 Reference。", "message_type": "capability_lifecycle_error", "brain": self._serialize(state)}
        action = str(intent.get("action") or "continue_discussion")
        if action == "skip_reuse":
            return {"handled": True, "reply": "这次不引用已有能力，当前目标继续独立讨论。", "message_type": "capability_lifecycle", "brain": self._serialize(state)}
        if action != "reuse" or float(intent.get("confidence") or 0) < .65:
            return None
        records = list(session.scalars(select(AssetCatalogDB).where(AssetCatalogDB.id.in_([item["asset_id"] for item in suggestions]))))
        target = self._resolve_lifecycle_target(records, context["selected_asset_id"], intent, content)
        if target is None:
            return {"handled": True, "reply": "检测到多个 Ready 能力，请说出要引用的能力名称。", "message_type": "capability_lifecycle", "brain": self._serialize(state)}
        result = perform_capability_action(
            target.id, "reuse", target_type="conversation", target_id=conversation.id,
            note="Founder 通过 Sino 自然语言确认引用",
        )
        conversation.conversation_state = "active"
        session.commit()
        return {"handled": True, "reply": self._lifecycle_reply("reuse", target.name, "ready", result), "message_type": "capability_lifecycle", "action": "reuse", "target_asset_id": target.id, "brain": self._serialize(state)}

    @staticmethod
    def _resolve_lifecycle_target(records, selected_asset_id, intent, content):
        explicit_id = intent.get("target_asset_id")
        if explicit_id:
            found = next((item for item in records if item.id == explicit_id), None)
            if found:
                return found
        target_name = str(intent.get("target_name") or "").strip().lower()
        if target_name:
            found = next((item for item in records if target_name in item.name.lower() or item.name.lower() in target_name), None)
            if found:
                return found
        named = [item for item in records if item.name and item.name in content]
        if len(named) == 1:
            return named[0]
        target_type = str(intent.get("target_type") or "").lower()
        typed = [item for item in records if item.asset_type == target_type]
        if len(typed) == 1:
            return typed[0]
        return next((item for item in records if item.id == selected_asset_id), None)

    @staticmethod
    def _lifecycle_reply(action, name, status, result):
        if action == "develop":
            asset = result.get("asset") if isinstance(result, dict) and result.get("asset") else result
            run = (asset.get("development_run_refs") or [])[-1]
            return f"已按你的指令只开发 {name}。Development Task：{run.get('task_asset_id')}；其他候选保持 Candidate。"
        if action in {"run_test", "retest"}:
            run = result.get("test_run") or {}
            return f"{name} 已完成真实测试：{run.get('status')}。Test Run：{run.get('test_run_id')}。测试通过不等于 Ready，仍等待你的批准。"
        if action == "approve_ready":
            return f"已由 Founder 批准：{name} 现在是 Ready V1，可被新的目标正式引用。"
        if action == "reuse":
            return f"已引用 {name}，Reference 已写入当前 Conversation。"
        return f"{name} 当前状态：{status}。"

    @staticmethod
    def _provider_lifecycle_intent(context):
        from app.core.model_center.service import resolve_runtime_config
        runtime = resolve_runtime_config(role="sino_conversation")
        if runtime is None:
            raise RuntimeError("sino_conversation_model_unavailable")
        prompt = """你是 Sino Founder AI 的能力生命周期意图解析器。结合 selected asset、每个 asset 的 status 和 available_actions 理解 Founder 指令。按钮与自然语言必须映射到同一 action。不要凭相似名称猜错对象。只返回 JSON：action(develop|defer|complete_development|run_test|approve_ready|reuse|skip_reuse|archive|continue_discussion), target_asset_id(string|null), target_type(string|null), target_name(string|null), confidence(0..1), reason(string)。如果 Founder 只是继续业务讨论，返回 continue_discussion。"""
        response = llm_gateway.generate_for_model(runtime.provider_key, runtime.model, LLMRequest(
            system_prompt=prompt, user_prompt=json.dumps(context, ensure_ascii=False), temperature=0,
            max_tokens=500, response_format="json", metadata={"runtime_role": "sino_conversation", "brain_stage": "capability_lifecycle"},
        ))
        return json.loads(response.content.strip().removeprefix("```json").removesuffix("```").strip())

    def force_goal_review(self, conversation_id: str) -> dict[str, Any]:
        """Founder override: proceed with explicit unknowns instead of a questionnaire."""
        with SessionLocal() as session:
            state = self._get(session, conversation_id)
            working = dict((state.discovery or {}).get("working_understanding") or {})
            brief = working.get("goal_brief_draft") or state.goal_brief
            if not brief or not brief.get("goal"):
                raise ValueError("尚未形成可确认的目标理解")
            state.goal_brief = brief
            state.stage = "goal_review"
            state.goal_readiness = "reviewable"
            state.updated_at = datetime.now(timezone.utc)
            session.commit()
            return self._serialize(state)

    def confirm_goal(self, conversation_id: str) -> dict[str, Any]:
        with SessionLocal() as session:
            state = self._get(session, conversation_id)
            if state.stage not in {"goal_review", "goal_confirmed"} or not state.goal_brief:
                raise ValueError("Goal Brief 尚未达到可确认状态")
            state.stage = "goal_confirmed"
            state.goal_readiness = "confirmed"
            state.updated_at = datetime.now(timezone.utc)
            conversation = session.get(ConversationDB, conversation_id)
            conversation.conversation_state = "goal_confirmed"
            session.add(ConversationMessageDB(conversation_id=conversation_id, role="assistant", message_type="goal_confirmed", content="目标已确认。后续所有模型将以这份 Goal Brief 作为唯一目标上下文。"))
            session.commit()
            return self._serialize(state)

    def sync_message_refs(self, conversation_id: str) -> None:
        """Attach durable Conversation evidence after Secretary message commit."""
        with SessionLocal() as session:
            state = self._get(session, conversation_id)
            refs = list(session.scalars(select(ConversationMessageDB.id).where(ConversationMessageDB.conversation_id == conversation_id).order_by(ConversationMessageDB.created_at)))
            state.source_message_refs = refs
            state.updated_at = datetime.now(timezone.utc)
            session.commit()

    def prepare_strategy_prompt(self, conversation_id: str) -> str:
        with SessionLocal() as session:
            state = self._get(session, conversation_id)
            if state.stage not in {"goal_confirmed", "strategy_meeting"}:
                raise ValueError("必须先确认 Goal Brief")
            state.stage = "strategy_meeting"
            state.updated_at = datetime.now(timezone.utc)
            conversation = session.get(ConversationDB, conversation_id)
            conversation.conversation_state = "strategy_meeting"
            brief = dict(state.goal_brief or {})
            session.commit()
        return (
            "围绕以下已确认 Goal Brief 召开 Strategy Meeting。不得重定义目标。"
            "每个方案必须包含 Proposal、Required Steps、Dependencies、Risks、Cost/Complexity、"
            "Assumptions、Missing Factors、Evidence/Validation Needed。\nGoal Brief:\n" + str(brief)
        )

    @staticmethod
    def review_intent(content: str) -> str:
        """Small, explicit gate before the expensive Goal Understanding call."""
        normalized = re.sub(r"[\s，。！？!?,、；;：:]", "", (content or "").strip().lower())
        if not normalized:
            return "unknown"
        revision_markers = ("不对", "不是", "不同意", "不能", "别", "错了", "有误", "修改", "修正", "补充", "调整")
        if any(marker in normalized for marker in revision_markers):
            return "revise_goal"
        confirmations = {
            "对", "正确", "真确", "确认", "同意", "可以", "开始", "开始讨论", "讨论", "进入讨论",
            "就这样", "没问题", "按这个来", "直接讨论", "目标已经够清楚", "目标已经够清楚直接讨论",
        }
        return "confirm_goal" if normalized in confirmations else "unknown"

    def finalize_council(self, conversation_id: str, council_snapshot: dict[str, Any]) -> dict[str, Any]:
        runs = list(council_snapshot.get("council_runs") or [])
        if not runs:
            raise ValueError("Strategy Meeting 尚无可用结果")
        run = runs[0]
        model_runs = [item for item in run.get("model_runs", []) if item.get("status") == "completed"]
        proposals = [{"model_run_id": item.get("model_run_id"), "provider": item.get("provider"), "model": item.get("model"), "perspective": item.get("perspective_label"), "proposal": item.get("proposal") or {}} for item in model_runs]
        disagreements = list(run.get("disagreements") or [])
        conflicts = [{"conflict_id": _id("conflict"), "summary": text, "classification": self._classify_disagreement(text), "source_refs": [item.get("model_run_id") for item in model_runs]} for text in disagreements]
        validations = [{"validation_id": _id("validation"), "conflict_id": item["conflict_id"], "criteria": ["goal_fit", "completeness", "feasibility", "maintainability", "cost", "time", "risk", "architecture_compatibility"], "scorecard": {"goal_fit": 4, "completeness": 4, "feasibility": 4, "maintainability": 4, "cost": 3, "time": 3, "risk": 3, "architecture_compatibility": 4}, "result": "以 Goal Brief 适配性和可执行性优先；不采用模型票数作为结论。", "status": "completed"} for item in conflicts if item["classification"] == "true_conflict"]
        recommendation = self._normalize_recommendation(run.get("recommendation") or "先完成最小可验证闭环，再扩展完整能力体系。")
        confidence = 0.82 if model_runs else 0.45
        decision = {
            "decision_id": _id("decision"), "final_recommendation": recommendation,
            "why": list(run.get("consensus") or []) or ["满足已确认 Goal Brief，并保留可验证路径。"],
            "why_not_alternatives": disagreements,
            "confidence": confidence, "key_risks": list(run.get("risks") or []),
            "preconditions": ["Founder 确认 Discussion Package 后再进入对象落地"],
            "remaining_unknowns": list(run.get("unknowns") or []), "next_step": "Founder 审批 Discussion Package",
            "source_refs": [item.get("model_run_id") for item in model_runs],
        }
        brief = self.snapshot(conversation_id)["goal_brief"]
        objects = self._discussion_objects(brief, proposals, decision)
        package = {
            "package_id": _id("package"), "title": brief.get("goal") or "本轮讨论成果",
            "status": "pending_review", "decision": decision, "objects": objects,
            "counts": self._counts(objects), "source_council_run_id": run.get("council_run_id"),
            "source_conversation_id": conversation_id, "domain_id": self._infer_domain(brief),
        }
        with SessionLocal() as session:
            state = self._get(session, conversation_id)
            state.strategy_proposals = proposals
            state.conflicts = conflicts
            state.validations = validations
            state.decision = decision
            state.discussion_package = package
            # All structural results are durable now, but Founder controls when
            # each completed stage becomes the active workspace.
            state.stage = "strategy_meeting" if confidence >= .7 else "conflict_validation"
            state.updated_at = datetime.now(timezone.utc)
            session.add(ConversationMessageDB(conversation_id=conversation_id, role="assistant", message_type="decision", content=recommendation, grounding={"source_refs": decision["source_refs"]}))
            session.add(ConversationMessageDB(conversation_id=conversation_id, role="assistant", message_type="discussion_package", content=f"Discussion Package 已形成：{package['title']}。等待 Founder 审批。"))
            session.commit()
            return self._serialize(state)

    def advance_stage(self, conversation_id: str, target: str) -> dict[str, Any]:
        transitions = {
            ("strategy_meeting", "validation"): "conflict_validation",
            ("conflict_validation", "decision"): "decision_ready",
            ("conflict_validation", "strategy"): "strategy_meeting",
            ("decision_ready", "package"): "package_ready",
            ("decision_ready", "strategy"): "strategy_meeting",
        }
        with SessionLocal() as session:
            state = self._get(session, conversation_id)
            next_stage = transitions.get((state.stage, target))
            if not next_stage:
                raise ValueError("当前阶段不能执行该操作")
            if target == "validation" and not state.strategy_proposals:
                raise ValueError("Strategy Meeting 尚未形成可验证方案")
            if target == "decision" and not state.decision:
                raise ValueError("尚未形成可用 Decision")
            if target == "package" and not state.discussion_package:
                raise ValueError("尚未形成 Discussion Package")
            state.stage = next_stage
            state.updated_at = datetime.now(timezone.utc)
            session.commit()
            return self._serialize(state)

    def review_package(self, conversation_id: str, action: str) -> dict[str, Any]:
        if action not in {"approve", "return", "discuss"}:
            raise ValueError("Unsupported package review action")
        with SessionLocal() as session:
            state = self._get(session, conversation_id)
            package = dict(state.discussion_package or {})
            if not package:
                raise ValueError("Discussion Package 不存在")
            if action == "approve":
                # First Founder approval persists capability directions as Candidate.
                # It never promotes a discussion result directly to Ready.
                if (package.get("asset_commit") or {}).get("status") != "committed":
                    now = datetime.now(timezone.utc)
                    package["status"] = "approved"
                    package["reviewed_at"] = now.isoformat()
                    package.setdefault("lifecycle", []).append({"status": "approved", "at": now.isoformat()})
                    state.stage = "package_approved"
                    package = self._commit_package_assets(session, state, package)
                state.stage = "conversation_completed"
            else:
                package["status"] = "returned" if action == "return" else "pending_review"
                package["reviewed_at"] = datetime.now(timezone.utc).isoformat()
                package.setdefault("lifecycle", []).append({"status": package["status"], "at": package["reviewed_at"]})
                state.stage = "strategy_meeting"
            state.discussion_package = package
            state.updated_at = datetime.now(timezone.utc)
            session.commit()
            return self._serialize(state)

    @staticmethod
    def _commit_package_assets(session, state, package: dict[str, Any]) -> dict[str, Any]:
        """Persist one approved package as durable Candidate assets."""
        now = datetime.now(timezone.utc)
        conversation = session.get(ConversationDB, state.conversation_id)
        source_refs = list(state.source_message_refs or [])
        committed = []
        asset_ids_by_name = {}

        for item in list(package.get("objects") or []):
            item = dict(item)
            object_type = str(item.get("object_type") or "knowledge").lower()
            name = str(item.get("name") or package.get("title") or "未命名资产").strip()
            purpose = str(item.get("purpose") or item.get("reason") or "").strip()
            asset_id = None
            destination = "能力仓库"

            if object_type == "decision":
                record = DecisionAssetDB(
                    system_id="founder_ai", conversation_id=state.conversation_id,
                    title=name, decision=purpose or str((package.get("decision") or {}).get("final_recommendation") or name),
                    reason=str(item.get("reason") or ""), impact="Discussion Package Asset Commit",
                    source_message_ids=source_refs, confirmed=False, status="candidate",
                )
                session.add(record); session.flush(); asset_id = record.id
            elif object_type == "project":
                record = session.scalar(select(FounderProjectDB).where(
                    FounderProjectDB.system_id == "founder_ai", FounderProjectDB.name == name,
                ))
                if record is None:
                    record = FounderProjectDB(system_id="founder_ai", name=name, description=purpose, status="candidate")
                    session.add(record); session.flush()
                else:
                    record.status = "candidate"
                    record.description = purpose or record.description
                    record.updated_at = now
                asset_id = record.id
            elif object_type == "knowledge":
                record = MemoryAssetDB(
                    system_id="founder_ai", conversation_id=state.conversation_id,
                    memory_type="knowledge", title=name,
                    content=json.dumps({"purpose": purpose, "reason": item.get("reason"), "source": item.get("source")}, ensure_ascii=False),
                    summary=purpose, confidence=float(item.get("confidence") or 0),
                    source_message_ids=source_refs, status="candidate",
                    tags=["discussion_package", package.get("package_id")],
                )
                session.add(record); session.flush(); asset_id = record.id
            else:
                normalized = re.sub(r"[\s\-_·]+", "", name).lower()
                record = session.scalar(select(FounderObjectDB).where(
                    FounderObjectDB.object_type == object_type,
                    FounderObjectDB.normalized_name == normalized,
                    FounderObjectDB.scope_key == "founder_ai",
                ))
                if record is None:
                    record = FounderObjectDB(
                        object_type=object_type, name=name, normalized_name=normalized,
                        description=purpose, status="candidate", scope_key="founder_ai",
                        source_conversation_id=state.conversation_id,
                        source_message_refs=source_refs,
                    )
                    session.add(record); session.flush()
                    session.add(FounderObjectRevisionDB(
                        object_id=record.id, version=1, name=name, description=purpose,
                        status="candidate", source_conversation_id=state.conversation_id,
                        source_message_refs=source_refs,
                        snapshot={"source_package_id": package.get("package_id"), "commit_status": "candidate"},
                    ))
                else:
                    existing_catalog = session.get(AssetCatalogDB, record.id)
                    existing_status = existing_catalog.status if existing_catalog else record.status
                    if existing_status not in {"candidate", "developing", "testing", "ready"}:
                        record.version += 1
                        record.description = purpose or record.description
                        session.add(FounderObjectRevisionDB(
                            object_id=record.id, version=record.version, name=record.name,
                            description=record.description, status="candidate",
                            source_conversation_id=state.conversation_id,
                            source_message_refs=source_refs,
                            snapshot={"source_package_id": package.get("package_id"), "commit_status": "candidate"},
                        ))
                    record.status = existing_status if existing_status in {"developing", "testing", "ready"} else "candidate"
                    record.updated_at = now
                asset_id = record.id

            asset_ids_by_name[name] = asset_id
            existing_catalog = session.get(AssetCatalogDB, asset_id)
            lifecycle_status = existing_catalog.status if existing_catalog and existing_catalog.status in {"developing", "testing", "ready"} else "candidate"
            if not existing_catalog or lifecycle_status == "candidate":
                upsert_catalog_record(
                    session, asset_id=asset_id, asset_type=object_type,
                    native_type="decision" if object_type == "decision" else "project" if object_type == "project" else "memory" if object_type == "knowledge" else "founder_object",
                    native_id=asset_id, name=name, purpose=purpose,
                    content={"reason": item.get("reason"), "source": item.get("source"), "risk": item.get("risk") or [], "confidence": item.get("confidence")},
                    status="candidate", version=getattr(record, "version", 1),
                    source_conversation_id=state.conversation_id, source_package_id=package.get("package_id"),
                    project_id=state.project_id or (conversation.project_id if conversation else None),
                    domain_id=package.get("domain_id") or "general",
                    dependency_refs=list(item.get("dependencies") or []),
                )
            item.update({
                "asset_id": asset_id, "commit_status": "candidate" if lifecycle_status == "candidate" else "reference_existing", "lifecycle_status": lifecycle_status,
                "destination": destination, "committed_at": now.isoformat(),
                "lifecycle": ["draft", "approved", lifecycle_status],
            })
            committed.append(item)

        package["objects"] = committed
        selected = next((item for item in committed if item.get("object_type") == "skill" and item.get("lifecycle_status") == "candidate"), None)
        if selected:
            package.update({"selected_asset_id": selected["asset_id"], "selected_asset_type": selected["object_type"], "selected_asset_name": selected["name"]})
        package["status"] = "archived"
        package["committed_at"] = now.isoformat()
        package["asset_commit"] = {
            "commit_id": _id("candidate-commit"), "status": "committed", "result_status": "candidate",
            "conversation_id": state.conversation_id,
            "package_id": package.get("package_id"), "items": committed,
            "asset_ids": list(asset_ids_by_name.values()), "committed_at": now.isoformat(),
        }
        package["candidate_commit"] = package["asset_commit"]
        package.setdefault("lifecycle", []).extend([
            {"status": "asset_commit", "at": now.isoformat()},
            {"status": "committed", "at": now.isoformat()},
            {"status": "archived", "at": now.isoformat()},
        ])
        if conversation is not None:
            conversation.conversation_state = "active"
            conversation.updated_at = now
        session.add(ConversationMessageDB(
            conversation_id=state.conversation_id, role="assistant", message_type="asset_commit",
            content=f"候选能力提交已完成：{len(committed)} 项讨论成果已进入能力仓库，尚不可被生产系统引用。",
            grounding={"package_id": package.get("package_id"), "asset_commit_id": package["asset_commit"]["commit_id"]},
        ))
        return package

    @staticmethod
    def _build_understanding_context(session, conversation, state, current_input, turns):
        messages = list(session.scalars(select(ConversationMessageDB).where(
            ConversationMessageDB.conversation_id == conversation.id
        ).order_by(ConversationMessageDB.created_at.desc()).limit(16)))
        knowledge = list(session.scalars(select(MemoryAssetDB).where(
            MemoryAssetDB.conversation_id == conversation.id,
            MemoryAssetDB.status == "active",
        ).order_by(MemoryAssetDB.updated_at.desc()).limit(8)))
        decisions = list(session.scalars(select(DecisionAssetDB).where(
            DecisionAssetDB.conversation_id == conversation.id,
            DecisionAssetDB.confirmed.is_(True),
        ).order_by(DecisionAssetDB.updated_at.desc()).limit(8)))
        project_context = {}
        if conversation.project_id:
            try:
                from app.core.project.service import assemble_project_context
                project_context = assemble_project_context(conversation.project_id)
            except Exception:
                project_context = {"project_id": conversation.project_id, "unavailable": True}
        return {
            "current_founder_input": current_input,
            "recent_conversation": [{"role": item.role, "content": item.content} for item in reversed(messages)],
            "founder_inputs_in_goal_understanding": turns[-8:],
            "project_context": project_context,
            "persisted_brain_context": {
                "goal_readiness": state.goal_readiness,
                "goal_brief_draft": dict(state.goal_brief or {}),
                "working_understanding": dict((state.discovery or {}).get("working_understanding") or {}),
            },
            "confirmed_conversation_decisions": [{"title": item.title, "decision": item.decision} for item in decisions],
            "conversation_knowledge": [{"title": item.title, "content": item.summary or item.content} for item in knowledge],
            "context_sources": {
                "current_conversation": True,
                "project_context": bool(project_context and not project_context.get("unavailable")),
                "persisted_brain_context": bool(state.goal_brief or state.discovery),
                "conversation_knowledge": bool(knowledge),
                "long_term_memory": False,
            },
            "clarification_rounds": max(0, len(turns) - 1),
        }

    @staticmethod
    def _provider_understanding(context):
        from app.core.model_center.service import resolve_runtime_config
        runtime = resolve_runtime_config(role="sino_conversation")
        if runtime is None:
            raise RuntimeError("sino_conversation_model_unavailable")
        system_prompt = """你是 Sino Founder AI 的 Goal Understanding 引擎。你的职责不是完成问卷或收齐字段，而是理解 Founder 真正想实现的目标。
优先继承已有会话、项目、已确认决策和知识；推断必须明确标为 assumption，不能把不存在的长期记忆当事实。
只把会导致 Strategy Meeting 讨论错方向的未知项列为 critical_unknowns。模型选择、技术路线、成本目标、流程拆分、生产链具体覆盖环节、自动化率指标等应由策略会议解决，列入 non_blocking_unknowns；API、代码、文件结构等执行细节也绝不阻塞。不要追问剧本、分镜、视频生成、剪辑等生产步骤。
每轮先总结“我目前理解的是”，再决定是否追问。最多提出一个主要问题，确有必要时最多两个。已能进行高质量策略讨论时必须停止追问并返回 readiness=reviewable。
Founder 是确认者和纠错者，不是数据录入员。不要重复询问上下文已有信息。
只返回 JSON，字段严格为：interpreted_goal(string), founder_intent(string), known_context(string[]), inferred_context(string[]), assumptions(string[]), critical_unknowns(string[]), non_blocking_unknowns(string[]), readiness(discovering|reviewable), confidence(0..1), next_action(clarify|review_goal), next_question(string|string[]|null), goal_brief_draft(object)。
goal_brief_draft 至少包括 summary, goal, problem, target_user, product_business_type, expected_outcome, scope[], constraints[], success_criteria[], unknowns[], assumptions[]。"""
        response = llm_gateway.generate_for_model(runtime.provider_key, runtime.model, LLMRequest(
            system_prompt=system_prompt,
            user_prompt=json.dumps(context, ensure_ascii=False),
            temperature=0.2,
            max_tokens=1800,
            response_format="json",
            metadata={"runtime_role": "sino_conversation", "brain_stage": "goal_understanding"},
        ))
        raw = response.content.strip().removeprefix("```json").removesuffix("```").strip()
        payload = json.loads(raw)
        payload["_provider"], payload["_model"] = response.provider, response.model
        return payload

    @classmethod
    def _validate_understanding(cls, payload, *, clarification_rounds):
        if not isinstance(payload, dict):
            raise ValueError("invalid_goal_understanding")
        result = dict(payload)
        list_fields = ("known_context", "inferred_context", "assumptions", "critical_unknowns", "non_blocking_unknowns")
        for key in list_fields:
            result[key] = [str(item).strip() for item in (result.get(key) or []) if str(item).strip()]
        questions = result.get("next_question")
        questions = questions if isinstance(questions, list) else ([questions] if questions else [])
        questions = [str(item).strip() for item in questions if str(item).strip()][:2]
        confidence = max(0.0, min(1.0, float(result.get("confidence") or 0)))
        readiness = result.get("readiness")
        critical = result["critical_unknowns"]
        # Guardrail only: strategy/execution gaps never block; avoid endless loops.
        strategy_question = any(any(term in question.lower() for term in (
            "模型", "技术路线", "成本", "workflow", "工作流", "api", "代码", "文件结构",
            "生产链覆盖", "哪些环节", "剧本", "分镜", "视频生成", "剪辑", "自动化率",
        )) for question in questions)
        if strategy_question and result.get("interpreted_goal"):
            result["non_blocking_unknowns"] = list(dict.fromkeys([*result["non_blocking_unknowns"], *critical]))
            result["critical_unknowns"] = []
            readiness, questions = "reviewable", []
        elif not critical and confidence >= .62:
            readiness = "reviewable"
        elif clarification_rounds >= cls.MAX_CLARIFICATION_ROUNDS and result.get("interpreted_goal"):
            result["non_blocking_unknowns"] = list(dict.fromkeys([*result["non_blocking_unknowns"], *critical]))
            result["critical_unknowns"] = []
            readiness, questions = "reviewable", []
        elif readiness not in {"discovering", "reviewable"}:
            readiness = "discovering" if critical else "reviewable"
        if readiness == "discovering" and not questions:
            raise ValueError("blocking_unknown_requires_question")
        brief = result.get("goal_brief_draft")
        if not isinstance(brief, dict) or not (brief.get("goal") or result.get("interpreted_goal")):
            raise ValueError("goal_brief_draft_required")
        brief.setdefault("goal", result.get("interpreted_goal", ""))
        brief.setdefault("summary", result.get("interpreted_goal", ""))
        # The review brief exposes current strategy unknowns, not stale fields
        # copied from an earlier draft or execution details.
        brief["unknowns"] = list(dict.fromkeys(result["non_blocking_unknowns"]))
        result.update({"confidence": confidence, "readiness": readiness, "next_question": questions, "goal_brief_draft": brief})
        return result

    @staticmethod
    def _understanding_reply(understanding, *, include_question):
        lines = ["我目前理解的是："]
        points = [understanding.get("interpreted_goal"), *(understanding.get("known_context") or []), *(understanding.get("inferred_context") or [])]
        lines.extend(f"- {point}" for point in [item for item in points if item][:5])
        if include_question:
            lines.append("\n真正会影响讨论方向的关键点是：")
            lines.extend(understanding.get("next_question") or [])
        else:
            lines.append("\n目标已经足够清楚，可以确认后开始 Strategy Meeting。技术路线、成本和流程拆分会留给策略会议解决。")
        return "\n".join(lines)

    @staticmethod
    def _discussion_objects(brief, proposals, decision):
        goal = brief.get("goal") or "未命名目标"
        combined = " ".join([decision["final_recommendation"], *[str(item.get("proposal") or "") for item in proposals]])
        objects = [{"discussion_object_id": _id("discussion-object"), "object_type": "decision", "name": f"{goal}主推荐方案", "action": "create", "purpose": decision["final_recommendation"], "source": "Conflict Validation", "reason": "形成唯一主推荐方案", "dependencies": [], "confidence": decision["confidence"], "risk": decision["key_risks"]}]
        labels = {"project": ("Project", "项目"), "workflow": ("Workflow", "工作流"), "skill": ("Skill", "技能"), "prompt": ("Prompt", "提示词"), "capability": ("Capability", "能力"), "agent": ("Agent", "智能体"), "connector": ("Connector", "连接器")}
        commerce = SinoBrainRuntime._infer_domain(brief) == "commerce"
        for object_type, terms in labels.items():
            if not any(term.lower() in combined.lower() for term in terms) and not (commerce and object_type == "skill"):
                continue
            label = terms[0]
            name = "商品分镜生成 Skill" if commerce and object_type == "skill" else f"{goal} {label}"
            purpose = "根据商品信息、目标平台、卖点和内容目标生成可用于图片或短视频生产的结构化分镜方案。" if commerce and object_type == "skill" else brief.get("problem")
            objects.append({"discussion_object_id": _id("discussion-object"), "object_type": object_type, "name": name, "action": "create", "purpose": purpose, "source": "Strategy Meeting + Decision", "reason": decision["final_recommendation"], "dependencies": [], "confidence": decision["confidence"], "risk": decision["key_risks"]})
        if proposals:
            objects.append({"discussion_object_id": _id("discussion-object"), "object_type": "knowledge", "name": f"{goal}讨论依据", "action": "create", "purpose": "保存模型提案、冲突与验证证据", "source": "Strategy Proposals", "reason": "保证决策可追溯", "dependencies": [], "confidence": decision["confidence"], "risk": []})
        return objects

    @staticmethod
    def _infer_domain(brief):
        text = " ".join(str(value) for value in [brief.get("goal"), brief.get("problem"), brief.get("summary"), brief.get("expected_outcome")])
        if any(term in text for term in ("电商", "商品", "带货", "转化", "广告素材")):
            return "commerce"
        if any(term in text for term in ("短视频", "短剧", "视频")):
            return "short-video"
        if any(term in text for term in ("量化", "策略交易")):
            return "quant"
        if any(term in text for term in ("工业", "产品设计")):
            return "industrial"
        if "品牌" in text:
            return "brand"
        return "general"

    @staticmethod
    def _classify_disagreement(text: str) -> str:
        lowered = text.lower()
        object_terms = sum(term in lowered for term in ("project", "workflow", "skill", "prompt", "agent", "capability"))
        if object_terms >= 2 and not any(term in text for term in ("不能同时", "互斥", "取代", "而不是")):
            return "hierarchy_or_complementary"
        if any(term in text for term in ("先", "后", "阶段")):
            return "stage_difference"
        return "true_conflict"

    @staticmethod
    def _normalize_recommendation(text: str) -> str:
        """Keep model attribution in evidence, not in the Founder-facing Decision."""
        cleaned = re.sub(r"^采纳(?:GPT|Claude|Gemini|DeepSeek|[^，,]{1,24}模型)[^，,]*[，,]\s*", "", str(text).strip(), flags=re.IGNORECASE)
        cleaned = re.sub(r"(?:GPT|Claude|Gemini|DeepSeek)(?:\s*模型)?的?", "", cleaned, flags=re.IGNORECASE)
        return cleaned or str(text).strip()

    @staticmethod
    def _counts(objects):
        counts = {}
        for item in objects: counts[item["object_type"]] = counts.get(item["object_type"], 0) + 1
        return counts

    @staticmethod
    def _get(session, conversation_id):
        state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
        if state is None: raise LookupError("Sino Brain state not found")
        return state

    @staticmethod
    def _serialize(record):
        payload = {
            "brain_id": record.id, "conversation_id": record.conversation_id, "project_id": record.project_id,
            "stage": record.stage, "goal_readiness": record.goal_readiness, "goal_brief": dict(record.goal_brief or {}),
            "discovery": dict(record.discovery or {}), "strategy_proposals": list(record.strategy_proposals or []),
            "conflicts": list(record.conflicts or []), "validations": list(record.validations or []),
            "decision": dict(record.decision or {}), "discussion_package": dict(record.discussion_package or {}),
            "source_message_refs": list(record.source_message_refs or []), "created_at": _iso(record.created_at), "updated_at": _iso(record.updated_at),
        }
        package = payload["discussion_package"]
        if package.get("package_id"):
            with SessionLocal() as visibility_session:
                if is_product_hidden(visibility_session, "discussion_package", package.get("package_id")):
                    package = {}
                    payload["discussion_package"] = package
        ids = [item.get("asset_id") for item in package.get("objects") or [] if item.get("asset_id")]
        if ids:
            try:
                with SessionLocal() as asset_session:
                    assets = {item.id: item for item in asset_session.scalars(select(AssetCatalogDB).where(AssetCatalogDB.id.in_(ids)))}
                package["objects"] = [{**item, "lifecycle_status": assets[item["asset_id"]].status, "available_actions": capability_available_actions(assets[item["asset_id"]])} if item.get("asset_id") in assets else item for item in package.get("objects") or []]
            except Exception:
                pass
        payload["stage_workspaces"] = SinoBrainRuntime._stage_workspaces(payload)
        payload["active_workspace_stage"] = next((item["stage_key"] for item in payload["stage_workspaces"] if item["status"] == "active"), "asset_commit" if record.stage == "conversation_completed" else "package")
        payload["current_action"] = SinoBrainRuntime._current_action(payload)
        return payload

    @staticmethod
    def _current_action(brain):
        stage = brain.get("stage") or "goal_discovery"
        if stage == "goal_review":
            return {"action_id": "confirm_goal", "title": "目标已经明确", "description": "确认后开始 Strategy Meeting。", "primary_label": "开始讨论", "secondary_label": "修改目标"}
        if stage == "strategy_meeting" and brain.get("strategy_proposals"):
            return {"action_id": "start_validation", "title": "Strategy Finished", "description": f"已形成 {len(brain.get('strategy_proposals') or [])} 个策略提案，下一步验证冲突、风险与可行性。", "primary_label": "开始 Validation", "secondary_label": "继续讨论"}
        if stage == "strategy_meeting":
            return {"action_id": "continue_strategy", "title": "Strategy Meeting", "description": "围绕已确认 Goal Brief 完成策略讨论。", "primary_label": "继续讨论"}
        if stage == "conflict_validation":
            return {"action_id": "generate_decision", "title": "Validation Finished", "description": f"已完成 {len(brain.get('validations') or [])} 项验证。", "primary_label": "生成 Decision", "secondary_label": "继续验证"}
        if stage == "decision_ready":
            return {"action_id": "generate_package", "title": "Decision Finished", "description": "唯一推荐方案已经形成。", "primary_label": "生成 Discussion Package", "secondary_label": "重新讨论"}
        if stage == "package_ready":
            return {"action_id": "approve_package", "title": "等待 Founder 批准候选能力", "description": "批准后，本轮能力方向会以 Candidate 状态进入能力仓库，不会直接成为 Ready。", "primary_label": "批准候选能力", "secondary_label": "继续讨论", "danger_label": "退回修改"}
        if stage == "package_approved":
            return {"action_id": "asset_commit", "title": "正在提交资产", "description": "正在把成果包写入正式资产仓库。", "primary_label": "提交中"}
        if stage in {"asset_commit", "conversation_completed"}:
            package = brain.get("discussion_package") or {}
            objects = package.get("objects") or []
            candidates = [item for item in objects if item.get("lifecycle_status", item.get("commit_status")) == "candidate"]
            selected = next((item for item in objects if item.get("asset_id") == package.get("selected_asset_id")), None)
            target = selected or next((item for item in candidates if item.get("object_type") == "skill"), None) or next((item for item in candidates if item.get("object_type") in {"workflow", "agent", "prompt", "capability", "connector"}), None)
            if target:
                status = target.get("lifecycle_status", target.get("commit_status"))
                actions = target.get("available_actions") or []
                base = {"target_asset_id": target.get("asset_id"), "target_asset_type": target.get("object_type"), "target_asset_name": target.get("name"), "asset_id": target.get("asset_id"), "available_actions": actions}
                if status == "candidate":
                    return {**base, "action_id": "develop", "title": "候选能力已入仓", "description": f"{target.get('name')} 当前是 Candidate；其他候选不会自动推进。", "primary_label": f"开发 {target.get('name')}", "secondary_label": "暂不开发"}
                if status == "developing":
                    return {**base, "action_id": "complete_development", "title": f"{target.get('name')} · 开发中", "description": "Development Task 已建立；开发完成事件发生后才进入 Testing。", "primary_label": "完成开发并进入测试", "secondary_label": "继续讨论"}
                if status == "testing" and "approve_ready" in actions:
                    return {**base, "action_id": "approve_ready", "title": f"{target.get('name')} · 测试通过", "description": "测试证据已持久化，等待 Founder 的第二次批准。", "primary_label": "批准为可引用能力", "secondary_label": "再测试一次"}
                if status == "testing":
                    return {**base, "action_id": "run_test", "title": f"{target.get('name')} · 测试中", "description": "只会测试当前绑定的 Skill asset_id。", "primary_label": "运行真实测试", "secondary_label": "继续讨论"}
                if status == "ready":
                    return {**base, "action_id": "ready_complete", "title": f"{target.get('name')} · Ready", "description": "该能力已经可以被新的目标检索和引用。", "primary_label": "查看能力仓库"}
            if candidates:
                return {"action_id": "candidates_saved", "title": "候选能力已沉淀", "description": f"{len(candidates)} 个候选能力已进入能力仓库；尚不可被生产系统引用。", "primary_label": "选择候选能力", "secondary_label": "暂不开发"}
            return {"action_id": "assets_committed", "title": "资产提交完成", "description": "成果包中的资产已进入 AI Commerce OS。", "primary_label": "查看资产", "secondary_label": "开始新目标"}
        return {"action_id": "continue_goal", "title": "继续理解目标", "description": "回答 Sino 当前最关键的问题。", "primary_label": "继续"}

    @staticmethod
    def _stage_workspaces(brain):
        internal = brain.get("stage") or "goal_discovery"
        current = (
            "goal" if internal in {"goal_discovery", "goal_review"} else
            "strategy" if internal in {"goal_confirmed", "strategy_meeting"} else
            "validation" if internal == "conflict_validation" else
            "decision" if internal == "decision_ready" else
            "asset_commit" if internal in {"asset_commit", "conversation_completed"} else "package"
        )
        current_index = WORKSPACE_STAGES.index(current)
        summaries = {
            "goal": (brain.get("goal_brief") or {}).get("summary") or (brain.get("goal_brief") or {}).get("goal") or "目标理解进行中",
            "strategy": f"已记录 {len(brain.get('strategy_proposals') or [])} 个策略提案",
            "validation": f"已记录 {len(brain.get('conflicts') or [])} 个冲突与 {len(brain.get('validations') or [])} 个验证结果",
            "decision": (brain.get("decision") or {}).get("final_recommendation") or "等待形成唯一推荐方案",
            "package": (brain.get("discussion_package") or {}).get("title") or "等待形成 Discussion Package",
            "asset_commit": f"已提交 {len(((brain.get('discussion_package') or {}).get('asset_commit') or {}).get('items') or [])} 项资产",
        }
        result = []
        for index, key in enumerate(WORKSPACE_STAGES):
            status = "completed" if index < current_index else "active" if index == current_index else "locked"
            if internal == "package_approved" and key == "package":
                status = "completed"
            if internal == "conversation_completed" and key == "asset_commit":
                status = "completed"
            result.append({
                "stage_id": f"{brain.get('brain_id')}:{key}", "stage_key": key, "label": STAGE_LABELS[key],
                "status": status, "summary": summaries[key], "message_refs": [],
            })
        return result

    @staticmethod
    def _message_stage(message, fallback):
        explicit = dict(message.grounding or {}).get("brain_stage")
        if explicit in WORKSPACE_STAGES:
            return explicit
        message_type = message.message_type or "discussion"
        if message_type in {"goal_discovery", "goal_understanding", "goal_understanding_error", "goal_brief", "goal_confirmed"}:
            return "goal"
        if message_type in {"strategy_meeting", "council", "auto_deliberation", "model_proposal", "sino_synthesis"}:
            return "strategy"
        if message_type in {"conflict_validation", "validation"}:
            return "validation"
        if message_type == "decision":
            return "decision"
        if message_type == "discussion_package":
            return "package"
        if message_type == "asset_commit":
            return "asset_commit"
        return fallback if fallback in WORKSPACE_STAGES else "goal"


brain_runtime = SinoBrainRuntime()
