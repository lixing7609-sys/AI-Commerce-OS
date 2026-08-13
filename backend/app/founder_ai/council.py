"""One-round independent model council with auditable, persisted synthesis."""

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from difflib import SequenceMatcher
from time import monotonic

from sqlalchemy import select

from app.core.artifact.model import ArtifactAssetDB
from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import CandidateGoalDB, ConversationMessageDB, PendingQuestionDB, SecretaryDigestDB
from app.core.council.model import CouncilModelRunDB, CouncilRunDB
from app.core.decision.model import DecisionAssetDB
from app.core.model_center.model import ModelProviderConfigDB, ModelRegistryDB
from app.core.project.service import get_project_intelligence
from app.database.db import SessionLocal
from app.founder_ai.secretary.service import SinoSecretaryService
from app.founder_ai.council_proposal_parser import ProposalParseError, parse_council_proposal
from app.llm.exceptions import AuthenticationError, ConfigurationError, LLMGatewayError, InvalidResponseError, ProviderUnavailableError
from app.llm.gateway import llm_gateway
from app.llm.models import LLMRequest


@dataclass(frozen=True)
class CouncilModel:
    key: str
    label: str
    role: str


class CouncilModelRegistry:
    def __init__(self):
        self._models: dict[str, CouncilModel] = {}

    def register(self, model: CouncilModel) -> None:
        self._models[model.key] = model

    def get(self, key: str) -> CouncilModel | None:
        return self._models.get(key)

    def list(self) -> list[CouncilModel]:
        return list(self._models.values())


model_registry = CouncilModelRegistry()
model_registry.register(CouncilModel("deepseek", "DeepSeek", "主力推理、快速分析与成本效率"))
model_registry.register(CouncilModel("gpt", "GPT", "综合推理、产品架构与多领域分析"))
model_registry.register(CouncilModel("claude", "Claude", "长上下文、架构审阅与复杂方案评审"))

COUNCIL_PERSPECTIVES = (
    {
        "perspective_role": "strategy_value",
        "perspective_label": "战略与价值",
        "perspective_prompt": "只从战略与价值视角分析：为什么做、业务与长期价值、竞争优势、优先级和机会成本。",
    },
    {
        "perspective_role": "counter_risk",
        "perspective_label": "反方与风险审查",
        "perspective_prompt": "只从反方与风险审查视角挑战问题：主动寻找逻辑漏洞、隐含假设、反例、失败条件、合规/成本/复杂度风险与替代方案。不要为了迎合常见观点而同意。",
    },
    {
        "perspective_role": "execution_feasibility",
        "perspective_label": "执行与可行性",
        "perspective_prompt": "只从执行与可行性视角分析：落地路径、依赖条件、系统边界、数据、API、技术实现、成本、MVP 和验证路径。",
    },
    {
        "perspective_role": "user_market",
        "perspective_label": "用户与市场",
        "perspective_prompt": "只从用户与市场视角分析：真实需求、使用行为、市场替代品、采用阻力与价值验证。",
    },
    {
        "perspective_role": "financial_roi",
        "perspective_label": "财务与 ROI",
        "perspective_prompt": "只从财务与 ROI 视角分析：投入、回收周期、边际成本、资源配置与可量化收益。",
    },
)

TWO_MODEL_PERSPECTIVES = (
    COUNCIL_PERSPECTIVES[0],
    {
        "perspective_role": "counter_execution_review",
        "perspective_label": "反方与执行审查",
        "perspective_prompt": "从反方与执行审查视角分析：优先挑战假设、风险与失败条件，并检验依赖、MVP、成本和可落地性。",
    },
)


class MultiModelCouncilService:
    def __init__(self, *, model_runner=None, synthesizer=None):
        self._uses_default_runner = model_runner is None
        self._model_runner = model_runner or self._run_model
        self._synthesizer = synthesizer

    def run(self, conversation_id: str, question: str, selected_models: list[str] | None = None, *, persist_founder_message: bool = True) -> dict:
        text = (question or "").strip()
        if not text:
            raise ValueError("Council question must not be empty")
        with SessionLocal() as session:
            conversation = session.get(ConversationDB, conversation_id)
            if conversation is None or conversation.system_id != "founder_ai":
                raise LookupError("Founder AI conversation not found")
            if persist_founder_message:
                session.add(ConversationMessageDB(conversation_id=conversation_id, role="founder", content=text, message_type="council"))
            conversation.updated_at = datetime.now(timezone.utc)
            session.commit()
        self._finalize_running(conversation_id, "superseded_by_retry" if not persist_founder_message else "superseded_by_new_run")
        context = self._context_package(conversation_id, text)
        targets = self._assign_perspectives(self._resolve_targets(selected_models))
        context["participant_models"] = [{"provider": item["provider_key"], "model": item["model"], **item["perspective"]} for item in targets]
        run = CouncilRunDB(conversation_id=conversation_id, project_id=context.get("project_id"), question=text, context_package=context, status="running")
        with SessionLocal() as session:
            session.add(run); session.commit(); session.refresh(run); run_id = run.id

        successful, failed_count = [], 0
        for target in targets:
            key, selected_model = target["provider_key"], target["model"]
            definition = model_registry.get(key) or self._dynamic_model_definition(key, selected_model)
            perspective = target["perspective"]
            if key in {"codex", "implementation"}:
                continue
            started = monotonic()
            parse_metadata = {}
            try:
                result = self._model_runner(definition, context, selected_model, perspective) if self._uses_default_runner else self._model_runner(definition, context)
                proposal, provider, model = result["proposal"], result["provider"], result["model"]
                parse_metadata = result.get("parse_metadata") or {}
                assigned_role = result.get("role") or definition.role
                status, error_type = "completed", None
                successful.append({"provider": provider, "model": model, "label": definition.label, "proposal": proposal, **perspective})
            except ConfigurationError:
                proposal, provider, model, status, error_type = {}, key, selected_model, "unavailable", "not_configured"
                assigned_role = definition.role
            except AuthenticationError:
                proposal, provider, model, status, error_type = {}, key, selected_model, "failed", "invalid_credentials"
                assigned_role = definition.role
            except LLMGatewayError as error:
                proposal, provider, model, status, error_type = {}, key, selected_model, "unavailable", error.error_type
                assigned_role = definition.role
                parse_metadata = {}
            except ProposalParseError as error:
                proposal, provider, model, status, error_type = {}, key, selected_model, "parse_failed", error.error_type
                assigned_role = definition.role
                parse_metadata = {"parser_version": 2, "parse_mode": "failed", "reason": error.reason}
            except LookupError:
                proposal, provider, model, status, error_type = {}, key, selected_model, "unavailable", "not_configured"
                assigned_role = definition.role
            if status != "completed":
                failed_count += 1
            latency = (monotonic() - started) * 1000
            with SessionLocal() as session:
                references = dict(context["grounding"])
                references["perspective"] = perspective
                if parse_metadata:
                    references["proposal_parse"] = parse_metadata
                session.add(CouncilModelRunDB(council_run_id=run_id, provider=provider, model=model, role=assigned_role, status=status, proposal=proposal, latency_ms=latency, error_type=error_type, context_references=references))
                session.commit()

        if not successful:
            self._finalize_failed(run_id, "all_participants_failed")
            raise LookupError("No Council provider is available")

        try:
            synthesis = self._synthesizer(text, context, successful) if self._synthesizer else self._synthesize_with_fallback(text, context, successful)
            synthesis = self._ensure_synthesis(synthesis, successful)
        except Exception as error:
            self._finalize_failed(run_id, getattr(error, "error_type", type(error).__name__))
            raise
        with SessionLocal() as session:
            record = session.get(CouncilRunDB, run_id)
            for field in ("consensus", "disagreements", "unique_insights", "risks", "unknowns"):
                setattr(record, field, list(synthesis.get(field) or []))
            record.recommendation = str(synthesis.get("recommendation") or "")
            record.candidate_decision = synthesis.get("candidate_decision")
            record.candidate_goal = synthesis.get("candidate_goal")
            record.status = "completed_partial" if failed_count else "completed"
            if record.candidate_decision:
                session.add(DecisionAssetDB(system_id="founder_ai", conversation_id=conversation_id, title=record.candidate_decision[:80], decision=record.candidate_decision, source_message_ids=[], confirmed=False))
            if record.candidate_goal:
                session.add(CandidateGoalDB(conversation_id=conversation_id, title=record.candidate_goal[:200], description=record.candidate_goal, source_message_ids=[], confidence=0.6, status="candidate"))
            for unknown in record.unknowns:
                session.add(PendingQuestionDB(conversation_id=conversation_id, content=str(unknown), reason="多模型讨论仍未形成结论", source_message_ids=[], status="open"))
            artifact = ArtifactAssetDB(system_id="founder_ai", conversation_id=conversation_id, artifact_type="model_consensus", title=f"模型共识：{text[:80]}", description=json.dumps({"question": text, "project_id": record.project_id, "context_version": context.get("prompt_version"), "participating_models": [item["label"] for item in successful], "proposals": successful, **synthesis, "founder_decision_status": "candidate"}, ensure_ascii=False), status="active")
            session.add(artifact); session.flush(); record.asset_id = artifact.id
            grounding = dict(context["grounding"])
            grounding["participating_models"] = [{"provider": item["provider"], "model": item["model"], "label": item["label"], "status": "completed"} for item in successful]
            reply = self._synthesis_text(synthesis)
            session.add(ConversationMessageDB(conversation_id=conversation_id, role="assistant", content=reply, message_type="council", grounding=grounding))
            conversation = session.get(ConversationDB, conversation_id)
            if conversation.title in {"New Conversation", "新讨论", ""}:
                conversation.title = SinoSecretaryService._title(text)
            digest = session.scalar(select(SecretaryDigestDB).where(SecretaryDigestDB.conversation_id == conversation_id))
            if digest is None:
                digest = SecretaryDigestDB(conversation_id=conversation_id)
                session.add(digest)
            digest.summary = self._council_summary(text, synthesis)
            digest.key_viewpoints = [*list(synthesis.get("consensus") or []), *list(synthesis.get("unique_insights") or [])]
            digest.constraints = list(synthesis.get("risks") or [])
            digest.updated_at = datetime.now(timezone.utc)
            conversation.updated_at = datetime.now(timezone.utc)
            session.commit()
        if context.get("project_id"):
            try:
                from app.core.project.service import apply_project_distillation
                apply_project_distillation(
                    context["project_id"],
                    summary=self._council_summary(text, synthesis),
                    viewpoints=[*list(synthesis.get("consensus") or []), *list(synthesis.get("unique_insights") or [])],
                    constraints=list(synthesis.get("risks") or []),
                    terminology=[],
                    prompt_delta={},
                )
            except Exception:
                pass
        try:
            from app.core.founder_object.service import recognize_objects
            recognize_objects(conversation_id, f"council:{run_id}", text, self._synthesis_text(synthesis))
        except Exception:
            pass
        return self.snapshot(conversation_id)

    def retry(self, conversation_id: str) -> dict:
        """Retry the latest failed Council turn without duplicating its Founder message."""
        with SessionLocal() as session:
            conversation = session.get(ConversationDB, conversation_id)
            if conversation is None or conversation.system_id != "founder_ai":
                raise LookupError("Founder AI conversation not found")
            latest = session.scalar(select(ConversationMessageDB).where(
                ConversationMessageDB.conversation_id == conversation_id,
                ConversationMessageDB.role == "founder",
                ConversationMessageDB.message_type == "council",
            ).order_by(ConversationMessageDB.created_at.desc()))
            if latest is None:
                raise ValueError("Conversation has no Council message to retry")
            text = latest.content
        return self.run(conversation_id, text, persist_founder_message=False)

    def run_auto(self, conversation_id: str, question: str, selected_models: list[str] | None = None, *, max_rounds: int = 5) -> dict:
        """Run repeated grounded rounds and stop after two low-gain rounds."""
        text = (question or "").strip()
        if not text: raise ValueError("discussion question must not be empty")
        with SessionLocal() as session:
            conversation = session.get(ConversationDB, conversation_id)
            if conversation is None or conversation.system_id != "founder_ai": raise LookupError("Founder AI conversation not found")
            session.add(ConversationMessageDB(conversation_id=conversation_id, role="founder", content=text, message_type="auto_deliberation"))
            conversation.updated_at = datetime.now(timezone.utc); session.commit()
        self._finalize_running(conversation_id, "superseded_by_new_run")
        context = self._context_package(conversation_id, text)
        targets = self._assign_perspectives(self._resolve_targets(selected_models))
        context.update({"discussion_mode": "auto_deliberation", "participant_models": [{"provider": t["provider_key"], "model": t["model"], **t["perspective"]} for t in targets]})
        run = CouncilRunDB(conversation_id=conversation_id, project_id=context.get("project_id"), question=text, context_package=context, status="running")
        with SessionLocal() as session:
            session.add(run); session.commit(); session.refresh(run); run_id = run.id
        previous, previous_round_proposals, low_gain, successful, synthesis, failures, rounds_trace = set(), [], 0, [], {}, 0, []
        try:
            for round_number in range(1, max(3, max_rounds) + 1):
                round_context = {**context, "auto_discussion": {"round": round_number, "founder_question": text, "previous_round_proposals": previous_round_proposals, "previous_synthesis": synthesis, "instruction": "读取自己与其它模型上一轮观点以及 Sino 上轮小结；回应、反驳、补充或修正，只提供新增信息。"}}
                current = []
                for target in targets:
                    key, model, perspective = target["provider_key"], target["model"], target["perspective"]
                    definition = model_registry.get(key) or self._dynamic_model_definition(key, model); started = monotonic(); proposal = {}; error_type = None; parse_metadata = {}
                    try:
                        result = self._model_runner(definition, round_context, model, perspective) if self._uses_default_runner else self._model_runner(definition, round_context)
                        proposal, provider, actual_model, status = result["proposal"], result["provider"], result["model"], "completed"
                        parse_metadata = result.get("parse_metadata") or {}; role = result.get("role") or definition.role
                        item = {"provider": provider, "model": actual_model, "label": definition.label, "proposal": proposal, **perspective, "round": round_number}; current.append(item); successful.append(item)
                    except ProposalParseError as error:
                        provider, actual_model, role, status, error_type = key, model, definition.role, "parse_failed", error.error_type
                    except AuthenticationError:
                        provider, actual_model, role, status, error_type = key, model, definition.role, "failed", "invalid_credentials"
                    except (ConfigurationError, LookupError):
                        provider, actual_model, role, status, error_type = key, model, definition.role, "unavailable", "not_configured"
                    except LLMGatewayError as error:
                        provider, actual_model, role, status, error_type = key, model, definition.role, "unavailable", error.error_type
                    failures += status != "completed"
                    refs = {**dict(context["grounding"]), "perspective": perspective, "deliberation_round": round_number}
                    if parse_metadata: refs["proposal_parse"] = parse_metadata
                    with SessionLocal() as session:
                        model_record = CouncilModelRunDB(council_run_id=run_id, provider=provider, model=actual_model, role=role, status=status, proposal=proposal, latency_ms=(monotonic()-started)*1000, error_type=error_type, context_references=refs)
                        session.add(model_record); session.commit(); session.refresh(model_record)
                        refs["model_run_id"] = model_record.id
                        if status == "completed": item["model_run_id"] = model_record.id
                if not current:
                    if not successful: raise ProviderUnavailableError()
                    break
                synthesis = self._ensure_synthesis(self._synthesizer(text, round_context, successful) if self._synthesizer else self._synthesize_with_fallback(text, round_context, successful), successful)
                claims = self._discussion_claims(current); gain = self._information_gain(previous, claims)
                low_gain = low_gain + 1 if round_number > 1 and gain < .18 else 0; previous.update(claims)
                round_summary = self._round_summary(synthesis, gain, low_gain)
                rounds_trace.append({"round_number": round_number, "sino_round_summary": round_summary, "information_gain": gain, "continue_discussion": low_gain < 2, "source_refs": [{"round_number": round_number, "model_run_id": item.get("model_run_id"), "model_id": item["model"], "provider_id": item["provider"]} for item in current]})
                previous_round_proposals = [{"provider_id": item["provider"], "model_id": item["model"], "perspective_role": item["perspective_role"], "proposal": item["proposal"]} for item in current]
                if low_gain >= 2: break
            self._persist_auto_result(run_id, conversation_id, text, context, synthesis, successful, failures, round_number, low_gain >= 2, rounds_trace)
        except Exception as error:
            self._finalize_failed(run_id, getattr(error, "error_type", type(error).__name__)); raise
        try:
            from app.core.founder_object.service import recognize_objects
            recognize_objects(conversation_id, f"deliberation:{run_id}", text, self._synthesis_text(synthesis))
        except Exception:
            pass
        return self.snapshot(conversation_id)

    @staticmethod
    def _discussion_claims(proposals):
        claims = set()
        for item in proposals:
            for field in ("core_judgment", "key_reasons", "recommendation", "risks", "objections", "founder_next_step"):
                raw = (item.get("proposal") or {}).get(field); values = raw if isinstance(raw, list) else [raw]
                claims.update("".join(str(value).lower().split()) for value in values if value)
        return claims

    @staticmethod
    def _information_gain(previous, current):
        if not current: return 0.0
        if not previous: return 1.0
        novel = sum(not any(SequenceMatcher(None, claim, old).ratio() >= .82 for old in previous) for claim in current)
        return novel / len(current)

    @staticmethod
    def _round_summary(synthesis, gain, low_gain):
        consensus = list(synthesis.get("consensus") or [])
        disagreements = list(synthesis.get("disagreements") or [])
        insights = list(synthesis.get("unique_insights") or [])
        if low_gain >= 2:
            next_focus = "连续两轮未出现新的关键证据，本轮信息已经基本收敛，结束讨论。"
        elif gain < .18:
            next_focus = "新增信息已经很少，准备收敛。"
        elif disagreements:
            next_focus = "仍有明显分歧，继续讨论。"
        else:
            next_focus = "继续验证尚未覆盖的证据与风险。"
        return {"consensus": consensus, "disagreements": disagreements, "new_information": insights, "next_focus": next_focus}

    def _persist_auto_result(self, run_id, conversation_id, question, context, synthesis, proposals, failures, rounds, auto_stopped, rounds_trace):
        synthesis = self._ensure_synthesis(synthesis, proposals)
        with SessionLocal() as session:
            record = session.get(CouncilRunDB, run_id)
            for field in ("consensus", "disagreements", "unique_insights", "risks", "unknowns"): setattr(record, field, list(synthesis.get(field) or []))
            record.recommendation, record.candidate_decision, record.candidate_goal = str(synthesis.get("recommendation") or ""), synthesis.get("candidate_decision"), synthesis.get("candidate_goal")
            source_refs = [reference for trace in rounds_trace for reference in trace["source_refs"]]
            record.context_package = {**dict(record.context_package or {}), "deliberation": {"round_count": rounds, "rounds": rounds_trace, "auto_stop": True, "stop_reason": "low_information_gain" if auto_stopped else "safety_limit", "stop_explanation": "连续两轮未出现新的关键证据，本轮结束。" if auto_stopped else "讨论已达到内部安全上限，由 Sino 收口。", "final_synthesis": synthesis, "source_refs": source_refs}}
            record.status = "completed_partial" if failures else "completed"
            if record.candidate_decision:
                session.add(DecisionAssetDB(system_id="founder_ai", conversation_id=conversation_id, title=record.candidate_decision[:80], decision=record.candidate_decision, source_message_ids=[], confirmed=False))
            if record.candidate_goal:
                session.add(CandidateGoalDB(conversation_id=conversation_id, title=record.candidate_goal[:200], description=record.candidate_goal, source_message_ids=[], confidence=.6, status="candidate"))
            for unknown in record.unknowns:
                session.add(PendingQuestionDB(conversation_id=conversation_id, content=str(unknown), reason="自动多轮讨论仍未形成结论", source_message_ids=[], status="open"))
            grounding = {**dict(context["grounding"]), "participating_models": [{"provider": p["provider"], "model": p["model"], "label": p["label"], "status": "completed"} for p in proposals]}
            session.add(ConversationMessageDB(conversation_id=conversation_id, role="assistant", content=self._synthesis_text(synthesis), message_type="auto_deliberation", grounding=grounding))
            conversation = session.get(ConversationDB, conversation_id)
            if conversation.title in {"New Conversation", "新讨论", ""}: conversation.title = SinoSecretaryService._title(question)
            digest = session.scalar(select(SecretaryDigestDB).where(SecretaryDigestDB.conversation_id == conversation_id)) or SecretaryDigestDB(conversation_id=conversation_id)
            session.add(digest); digest.summary = self._council_summary(question, synthesis); digest.key_viewpoints = [*list(synthesis.get("consensus") or []), *list(synthesis.get("unique_insights") or [])]; digest.constraints = list(synthesis.get("risks") or []); digest.updated_at = conversation.updated_at = datetime.now(timezone.utc); session.commit()
        if context.get("project_id"):
            try:
                from app.core.project.service import apply_project_distillation
                apply_project_distillation(context["project_id"], summary=self._council_summary(question, synthesis), viewpoints=[*list(synthesis.get("consensus") or []), *list(synthesis.get("unique_insights") or [])], constraints=list(synthesis.get("risks") or []), terminology=[], prompt_delta={})
            except Exception: pass

    def _resolve_targets(self, selected_models: list[str] | None) -> list[dict]:
        from app.core.model_center.service import resolve_multi_model_configs
        configured = [{"provider_key": item.provider_key, "model": item.model} for item in resolve_multi_model_configs()]
        if not configured and not self._uses_default_runner:
            configured = [{"provider_key": item.key, "model": f"{item.key}-model"} for item in model_registry.list()]
        if selected_models:
            configured = [item for item in configured if item["provider_key"] in selected_models]
        return [item for item in configured if not self._image_or_non_text_model(item["model"])]

    @staticmethod
    def _assign_perspectives(targets: list[dict]) -> list[dict]:
        roles = TWO_MODEL_PERSPECTIVES if len(targets) == 2 else COUNCIL_PERSPECTIVES
        return [{**target, "perspective": dict(roles[index % len(roles)])} for index, target in enumerate(targets)]

    @staticmethod
    def _dynamic_model_definition(provider_key: str, model: str) -> CouncilModel:
        """Build a Council participant from the installed provider/model pair.

        Provider Registry V2 permits several providers to expose GPT, Claude, or
        other text models. Council identity therefore cannot be restricted to the
        three legacy provider keys.
        """
        name = (model or "").lower()
        if "claude" in name:
            label = "Claude"
        elif any(term in name for term in ("gpt", "o1", "o3", "o4")):
            label = "GPT"
        elif "deepseek" in name:
            label = "DeepSeek"
        else:
            label = model or provider_key
        return CouncilModel(provider_key, label, "独立分析与方案评审")

    @staticmethod
    def _image_or_non_text_model(model: str) -> bool:
        name = (model or "").lower()
        return any(term in name for term in ("image", "embedding", "moderation", "transcribe", "tts", "realtime", "whisper", "sora"))

    @staticmethod
    def _finalize_failed(run_id: str, reason: str) -> None:
        with SessionLocal() as session:
            record = session.get(CouncilRunDB, run_id)
            if record:
                record.status = "failed"
                package = dict(record.context_package or {})
                package["failure_reason"] = reason
                record.context_package = package
                session.commit()

    @staticmethod
    def _finalize_running(conversation_id: str, reason: str) -> None:
        with SessionLocal() as session:
            records = list(session.scalars(select(CouncilRunDB).where(
                CouncilRunDB.conversation_id == conversation_id,
                CouncilRunDB.status == "running",
            )))
            for record in records:
                record.status = "failed"
                package = dict(record.context_package or {})
                package["failure_reason"] = reason
                record.context_package = package
            if records:
                session.commit()

    @staticmethod
    def _context_package(conversation_id: str, current_message: str) -> dict:
        with SessionLocal() as session:
            conversation = session.get(ConversationDB, conversation_id)
            messages = list(session.scalars(select(ConversationMessageDB).where(ConversationMessageDB.conversation_id == conversation_id).order_by(ConversationMessageDB.created_at.desc()).limit(10)))
        intelligence = get_project_intelligence(conversation.project_id) if conversation.project_id else {}
        base = {
            "project_id": conversation.project_id,
            "project_summary": intelligence.get("project_summary"), "current_position": intelligence.get("current_positioning"),
            "living_prompt": intelligence.get("master_prompt"), "prompt_version": intelligence.get("prompt_version"),
            "confirmed_decisions": [item for item in intelligence.get("decisions", []) if item.get("confirmed")],
            "knowledge": intelligence.get("knowledge", []), "constraints": intelligence.get("constraints", []), "terminology": intelligence.get("terminology", []),
            "pending_questions": intelligence.get("pending_questions", []), "goals": [*intelligence.get("candidate_goals", []), *intelligence.get("active_goals", [])],
            "current_conversation": [{"role": item.role, "content": item.content} for item in reversed(messages)], "current_message": current_message,
        }
        project_keys = {"project_summary", "current_position", "living_prompt", "confirmed_decisions", "knowledge", "constraints", "terminology", "pending_questions", "goals"}
        labels = {"project_summary": "项目摘要", "current_position": "当前定位", "living_prompt": "动态提示词", "prompt_version": "提示词版本", "confirmed_decisions": "正式决策", "knowledge": "项目知识", "constraints": "项目约束", "terminology": "项目术语", "pending_questions": "待确认问题", "goals": "项目目标", "current_conversation": "当前会话", "current_message": "Founder 当前输入"}
        sources = []
        for key, value in base.items():
            if key == "project_id": continue
            count = len(value) if isinstance(value, list) else None
            sources.append({"key": key, "label": labels.get(key, key), "available": bool(value), "used": bool(value), **({"count": count} if count is not None else {}), **({"version": f"v{base['prompt_version']}"} if key == "living_prompt" and value else {})})
        sources.append({"key": "external_model_knowledge", "label": "模型通用知识", "available": True, "used": True})
        if not conversation.project_id:
            for source in sources:
                if source["key"] in project_keys: source["available"] = source["used"] = False
        base["grounding"] = {"schema_version": 1, "sources": sources}
        return base

    @staticmethod
    def _run_model(definition: CouncilModel, context: dict, selected_model: str, perspective: dict) -> dict:
        assigned_role = perspective["perspective_label"]
        anti_consensus = "不要主动寻求共识，不要为了完整而覆盖所有角度，只负责自己的 Perspective；若判断与常见观点不同，明确保留异议。目标是提高信息增量，不是提高答案相似度。"
        incremental = "本轮处于自动连续讨论中，只补充此前未覆盖的信息、异议、证据或修正，禁止复述。" if context.get("discussion_mode") == "auto_deliberation" else ""
        response = llm_gateway.generate_for_model(definition.key, selected_model, LLMRequest(system_prompt=f"你是独立委员会成员。本轮唯一职责：【{assigned_role}】。{perspective['perspective_prompt']}{anti_consensus}{incremental} 只返回 JSON，字段：core_judgment, key_reasons, recommendation, risks, objections, founder_next_step。所有字段围绕本视角。", user_prompt=json.dumps(context, ensure_ascii=False), temperature=0.25, max_tokens=1400, response_format="json", metadata={"council_model": definition.key, "model": selected_model, "perspective_role": perspective["perspective_role"], "perspective_label": assigned_role, "discussion_mode": context.get("discussion_mode") or "single_round"}))
        parsed = parse_council_proposal(response.content)
        # Preserve the selected Provider Registry identity. Compatible adapters
        # report their protocol family (for example ``openai``), which is not the
        # concrete provider_id required for auditing and synthesis fallback.
        return {"proposal": parsed.proposal, "parse_metadata": parsed.metadata, "provider": definition.key, "model": selected_model, "role": assigned_role}

    @staticmethod
    def _synthesize(question: str, context: dict, proposals: list[dict]) -> dict:
        from app.core.model_center.service import resolve_runtime_config
        runtime = resolve_runtime_config(role="sino_conversation")
        if runtime is None:
            raise ConfigurationError("sino_synthesis_model_missing")
        return MultiModelCouncilService._synthesize_with_model(question, context, proposals, runtime.provider_key, runtime.model)

    @staticmethod
    def _synthesize_with_model(question: str, context: dict, proposals: list[dict], provider: str, model: str) -> dict:
        response = llm_gateway.generate_for_model(provider, model, LLMRequest(system_prompt="你是 Sino。各 Proposal 来自不同 Perspective。比较其公开观点，不得输出隐藏推理；提炼共识、主要分歧、互补观点、各模型的独特信息、风险、Founder 应采用的判断与仍未解决的问题，不要简单拼接原文。只返回 JSON：consensus[], disagreements[], unique_insights[], risks[], unknowns[], recommendation, candidate_decision, candidate_goal。候选项不得自动确认为正式 Decision/Goal。", user_prompt=json.dumps({"question": question, "context_grounding": context["grounding"], "proposals": proposals}, ensure_ascii=False), temperature=0.2, max_tokens=1600, response_format="json", metadata={"council_synthesis": True, "model": model, "perspective_aware": True}))
        try: return json.loads(response.content.strip().removeprefix("```json").removesuffix("```").strip())
        except Exception as error: raise InvalidResponseError() from error

    @staticmethod
    def _synthesize_with_fallback(question: str, context: dict, proposals: list[dict]) -> dict:
        attempted = set()
        try:
            return MultiModelCouncilService._synthesize(question, context, proposals)
        except LLMGatewayError:
            from app.core.model_center.service import resolve_runtime_config
            primary = resolve_runtime_config(role="sino_conversation")
            if primary:
                attempted.add((primary.provider_key, primary.model))
        last_error = None
        for proposal in proposals:
            target = (proposal["provider"], proposal["model"])
            if target in attempted:
                continue
            try:
                return MultiModelCouncilService._synthesize_with_model(question, context, proposals, *target)
            except LLMGatewayError as error:
                last_error = error
        raise last_error or ProviderUnavailableError()

    @staticmethod
    def _synthesis_text(synthesis: dict) -> str:
        def lines(key): return "；".join(str(item) for item in synthesis.get(key, []) if item) or "—"
        return f"模型共识：{lines('consensus')}\n主要分歧：{lines('disagreements')}\nSino 综合判断：{synthesis.get('recommendation') or '—'}"

    @staticmethod
    def _ensure_synthesis(synthesis: dict | None, proposals: list[dict]) -> dict:
        """Guarantee persisted synthesis using only public, successful proposals.

        Some compatible providers can return a valid but empty JSON object. That
        is not a valid Sino synthesis. In that case, derive the display contract
        solely from already-persistable public proposal fields; never invent a
        conclusion or make another provider request.
        """
        result = dict(synthesis or {})
        visible = ("recommendation", "consensus", "disagreements", "unique_insights", "risks", "candidate_goal")
        if any(result.get(field) for field in visible):
            return result
        completed = [item.get("proposal") for item in proposals if isinstance(item.get("proposal"), dict) and item.get("proposal")]
        judgments = [str(item.get("core_judgment")).strip() for item in completed if item.get("core_judgment")]
        recommendations = [str(item.get("recommendation")).strip() for item in completed if item.get("recommendation")]
        risks = []
        next_steps = []
        for item in completed:
            raw_risks = item.get("risks")
            risks.extend(str(value).strip() for value in (raw_risks if isinstance(raw_risks, list) else [raw_risks]) if value)
            if item.get("founder_next_step"):
                next_steps.append(str(item["founder_next_step"]).strip())
        result.update({
            "consensus": judgments,
            "disagreements": [],
            "unique_insights": [],
            "risks": risks,
            "unknowns": [],
            "recommendation": recommendations[0] if recommendations else (judgments[0] if judgments else ""),
            "candidate_decision": None,
            "candidate_goal": next_steps[0] if next_steps else None,
        })
        return result

    @staticmethod
    def _council_summary(question: str, synthesis: dict) -> str:
        consensus = "；".join(str(item) for item in synthesis.get("consensus", []) if item)
        unknowns = "；".join(str(item) for item in synthesis.get("unknowns", []) if item)
        return f"讨论：{question}。形成：{consensus or synthesis.get('recommendation') or '待进一步讨论'}。待确认：{unknowns or '无'}"[:1200]

    def snapshot(self, conversation_id: str) -> dict:
        snapshot = SinoSecretaryService(reply_generator=lambda *_: "").snapshot(conversation_id)
        with SessionLocal() as session:
            runs = list(session.scalars(select(CouncilRunDB).where(CouncilRunDB.conversation_id == conversation_id).order_by(CouncilRunDB.created_at)))
            model_runs = list(session.scalars(select(CouncilModelRunDB).where(CouncilModelRunDB.council_run_id.in_([item.id for item in runs])).order_by(CouncilModelRunDB.created_at, CouncilModelRunDB.id))) if runs else []
            providers = {item.provider_key: item for item in session.scalars(select(ModelProviderConfigDB))}
            models = {(item.provider_id, item.model_id): item for item in session.scalars(select(ModelRegistryDB))}
        def identity(provider_id, model_id):
            provider = providers.get(provider_id)
            model = models.get((provider_id, model_id))
            return {
                "provider_display_name": provider.display_name if provider else ({"deepseek": "DeepSeek", "gpt": "OpenAI", "claude": "Anthropic"}.get(provider_id) or "AI 服务"),
                "model_display_name": self._display_model_name(model_id) if "/" in (model_id or "") else (model.display_name if model else self._display_model_name(model_id)),
            }
        snapshot["council_runs"] = [{"council_run_id": run.id, "conversation_id": run.conversation_id, "project_id": run.project_id, "question": run.question, "discussion_mode": (run.context_package or {}).get("discussion_mode", "council"), "deliberation": (run.context_package or {}).get("deliberation"), "consensus": run.consensus, "disagreements": run.disagreements, "unique_insights": run.unique_insights, "risks": run.risks, "unknowns": run.unknowns, "recommendation": run.recommendation, "candidate_decision": run.candidate_decision, "candidate_goal": run.candidate_goal, "decision_status": run.decision_status, "asset_id": run.asset_id, "status": run.status, "failure_reason": (run.context_package or {}).get("failure_reason"), "participants": [{**item, **identity(item.get("provider"), item.get("model"))} for item in list((run.context_package or {}).get("participant_models") or [])], "created_at": run.created_at.isoformat(), "model_runs": [{"model_run_id": item.id, "provider": item.provider, "model": item.model, **identity(item.provider, item.model), "round_number": (item.context_references or {}).get("deliberation_round"), "role": item.role, "perspective_role": ((item.context_references or {}).get("perspective") or {}).get("perspective_role"), "perspective_label": ((item.context_references or {}).get("perspective") or {}).get("perspective_label"), "status": item.status, "proposal": item.proposal, "parse_metadata": (item.context_references or {}).get("proposal_parse"), "latency_ms": item.latency_ms, "error_type": item.error_type} for item in model_runs if item.council_run_id == run.id]} for run in runs]
        return snapshot

    @staticmethod
    def _display_model_name(model_id: str | None) -> str:
        value = (model_id or "模型").split("/")[-1]
        if value.lower().startswith("gpt-"):
            return "GPT-" + " ".join(part.capitalize() for part in value[4:].replace("_", "-").split("-"))
        if value.lower().startswith("deepseek-"):
            return "DeepSeek " + " ".join(part.capitalize() for part in value[9:].replace("_", "-").split("-"))
        parts = value.replace("_", "-").split("-")
        return " ".join(part.upper() if part.lower() in {"gpt", "ai"} else part.capitalize() for part in parts)


council_service = MultiModelCouncilService()
