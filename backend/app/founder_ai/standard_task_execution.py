"""Autonomous execution lane for clear, bounded non-strategic development tasks."""
from __future__ import annotations

from copy import deepcopy
from dataclasses import replace
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
from threading import Thread
import time
from uuid import uuid4

from sqlalchemy import select

from app.core.task_asset.model import TaskAssetDB
from app.core.task_asset.service import (
    create_task_asset, decide_task_execution_approval, ensure_task_execution_approval,
    invalidate_task_execution_approval, validate_task_execution_approval,
)
from app.database.db import SessionLocal
from app.founder_ai.execution_registry import create_execution_session, get_execution_session, list_execution_sessions, save_execution_session
from app.founder_ai.execution_worker import enqueue_execution
from app.founder_ai.execution_events import append_event
from app.founder_ai.orchestrator import ExecutionPackage, TaskAssetDraft
from core.conversation_first.model import ConversationMessageDB, SinoBrainSessionDB

REPO_ROOT = Path(__file__).resolve().parents[3]
STEPS = ("inspect", "plan", "execution", "verification", "checkpoint", "learning", "closure", "complete")
PRE_DISPATCH_DECISION_REVISION = "canonical-pre-dispatch-v1"
CANDIDATE_AUTHORITY_SCHEMA_VERSION = "candidate-authority-v1"
SUPPORTED_BROWSER_ADAPTERS = {
    ("generic_visible_interaction", "search_clear"): "system_chrome_playwright",
    ("generic_visible_interaction", "derived_visible_count"): "system_chrome_playwright",
    ("generic_visible_interaction", "generic_control_state"): "system_chrome_playwright",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sync_execution_approval_action(*, conversation_id: str, task_id: str, authority: dict,
                                    approval: dict, status: str = "pending") -> dict:
    """Project canonical TaskAsset approval into the durable Founder Action Queue."""
    now = _now()
    action_id = f"execution-approval:{approval['approval_id']}"
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(
            SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            raise LookupError("Sino Brain state not found")
        discovery = dict(state.discovery or {})
        queue = [dict(item) for item in discovery.get("founder_action_queue") or []]
        action = next((item for item in queue if item.get("action_id") == action_id), None)
        values = {
            "action_id": action_id, "conversation_id": conversation_id, "task_id": task_id,
            "candidate_id": authority["candidate_id"],
            "canonical_fingerprint": authority["canonical_fingerprint"],
            "approval_id": approval["approval_id"], "risk": authority["risk"],
            "type": "EXECUTION_APPROVAL", "status": status,
            "title": "执行审批", "summary": "当前任务需要 Founder 审批后才能执行。",
            "required_input": "DECIDE_EXECUTION_APPROVAL", "reason": "risk_or_policy_requires_approval",
            "created_at": (action or {}).get("created_at") or now,
            "resolved_at": now if status != "pending" else None,
            "resolution": approval.get("decision") if status != "pending" else None,
        }
        if action is None:
            queue.append(values)
        else:
            action.update(values)
        discovery["founder_action_queue"] = queue
        discovery["founder_action_required"] = any(item.get("status") == "pending" for item in queue)
        state.discovery = discovery
        state.updated_at = datetime.now(timezone.utc)
        db.commit()
        return values


def _canonical_hash(value) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _normalized_values(values) -> list[str]:
    return sorted({" ".join(str(item or "").split()) for item in values or [] if str(item or "").strip()})


def pre_dispatch_intent_fingerprint(*, goal: str, founder_constraints=None,
                                    founder_acceptance_criteria=None, current_route: str | None = None) -> str:
    """Identify one Founder-authoritative task intent without timestamps or runtime identities."""
    return _canonical_hash({
        "goal": " ".join(str(goal or "").casefold().split()),
        "authoritative_constraints": _normalized_values(founder_constraints),
        "acceptance_criteria": _normalized_values(founder_acceptance_criteria),
        "current_route": str(current_route or ""),
    })


def stable_candidate_id(*, conversation_id: str, source_message_id: str | None,
                        intent_fingerprint: str) -> str:
    """Return one stable Candidate identity for retries of the same Founder intent."""
    identity = source_message_id or intent_fingerprint
    digest = hashlib.sha256(f"{conversation_id}:{identity}".encode("utf-8")).hexdigest()[:20]
    return f"task-candidate-{digest}"


def stable_execution_id(*, task_id: str, canonical_fingerprint: str) -> str:
    """Identify one execution start for one durable Task authority version."""
    digest = hashlib.sha256(
        f"standard-execution:{task_id}:{canonical_fingerprint}".encode("utf-8")
    ).hexdigest()[:20]
    return f"execution-{digest}"


def candidate_authority_snapshot(*, decision: dict, conversation_id: str,
                                 source_message_id: str | None,
                                 candidate_id: str | None = None) -> dict:
    """Freeze the canonical Candidate decision used by every Production transition."""
    candidate_id = candidate_id or stable_candidate_id(
        conversation_id=conversation_id, source_message_id=source_message_id,
        intent_fingerprint=decision["intent_fingerprint"],
    )
    contract = deepcopy(decision.get("standard_task_contract") or {})
    return {
        "schema_version": CANDIDATE_AUTHORITY_SCHEMA_VERSION,
        "candidate_id": candidate_id,
        "conversation_id": conversation_id,
        "source_message_id": source_message_id,
        "canonical_fingerprint": decision["decision_fingerprint"],
        "intent_fingerprint": decision["intent_fingerprint"],
        "scope_fingerprint": decision["scope_fingerprint"],
        "contract_fingerprint": decision["contract_fingerprint"],
        "semantic_target": deepcopy(decision.get("semantic_target")),
        "confidence": decision.get("semantic_confidence"),
        "interaction_intent": decision.get("interaction_intent"),
        "production_scope": list(decision.get("allowed_production_files") or []),
        "test_scope": list(decision.get("allowed_test_files") or []),
        "shared_support_scope": list(decision.get("allowed_shared_support_files") or []),
        "contract": contract,
        "founder_constraints": list(contract.get("constraints") or []),
        "founder_acceptance_criteria": list(contract.get("acceptance_criteria") or []),
        "interaction_contract": deepcopy(decision.get("visible_artifact_contract")),
        "adapter": decision.get("browser_adapter"),
        "adapter_compatibility": decision.get("adapter_compatibility"),
        "risk": decision.get("risk"),
        "clarification_required": bool(decision.get("clarification_required")),
        "approval_required": bool(decision.get("approval_required")),
        "dispatch_allowed": bool(decision.get("dispatch_allowed")),
        "blocked_reason": decision.get("blocked_reason"),
        "reuse": {"attempted": False, "matched": False, "reason": "pending_production_identity"},
        "execution_constraints": list((decision.get("standard_task_contract") or {}).get("prohibited_scope") or []),
        "created_at": decision.get("created_at") or _now(),
    }


def bind_persisted_candidate_authority(*, route: dict, candidate: dict,
                                       conversation_id: str,
                                       source_message_id: str | None = None) -> dict:
    """Project one persisted Candidate authority onto a non-authoritative route.

    Routing may add operational hints, but it must not reinterpret the Candidate's
    risk, admission, scope, contract, constraints, or canonical fingerprint.
    """
    result = dict(route)
    decision = deepcopy(candidate.get("canonical_pre_dispatch_decision") or {})
    authority = deepcopy(candidate.get("candidate_authority") or {})
    candidate_id = str(candidate.get("candidate_id") or "")
    if not decision or not authority or not candidate_id:
        raise ValueError("persisted_candidate_authority_incomplete")
    if authority.get("candidate_id") != candidate_id:
        raise ValueError("persisted_candidate_identity_mismatch")
    if authority.get("conversation_id") != conversation_id:
        raise ValueError("persisted_candidate_conversation_mismatch")
    if source_message_id and authority.get("source_message_id") != source_message_id:
        raise ValueError("persisted_candidate_source_message_mismatch")
    if authority.get("canonical_fingerprint") != decision.get("decision_fingerprint"):
        raise ValueError("persisted_candidate_authority_fingerprint_mismatch")
    constraints = list(candidate.get("constraints") or [])
    acceptance = list(candidate.get("acceptance_criteria") or [])
    expected_intent = pre_dispatch_intent_fingerprint(
        goal=str(candidate.get("goal") or ""), founder_constraints=constraints,
        founder_acceptance_criteria=acceptance,
    )
    if decision.get("intent_fingerprint") != expected_intent:
        raise ValueError("persisted_candidate_authority_intent_mismatch")
    result["canonical_pre_dispatch_decision"] = decision
    result["candidate_authority"] = authority
    result["standard_task_contract"] = deepcopy(authority.get("contract") or {})
    result["dispatch_admission"] = deepcopy(decision.get("dispatch_admission") or {})
    result["founder_constraints"] = constraints
    result["founder_acceptance_criteria"] = acceptance
    result["confirmed_decisions"] = list(candidate.get("confirmed_decisions") or [])
    result["risk"] = authority.get("risk")
    result["approval_required"] = bool(authority.get("approval_required"))
    result["clarification_required"] = bool(authority.get("clarification_required"))
    result["founder_gate_required"] = bool(
        authority.get("clarification_required") or authority.get("approval_required")
    )
    return result


def _classify_scope_files(paths: list[str]) -> dict:
    production, tests, support = [], [], []
    for path in paths:
        if ".test." in path or path.startswith(("backend/tests/", "frontend/tests/")):
            tests.append(path)
        elif path.endswith((".css", ".scss", ".sass", ".less")):
            support.append(path)
        else:
            production.append(path)
    return {
        "allowed_production_files": production,
        "allowed_test_files": tests,
        "allowed_shared_support_files": support,
        "allowed_files": list(paths),
    }


def _contract_fingerprint(contract: dict) -> str:
    visible = dict(contract.get("visible_artifact_contract") or {})
    requirements = dict(visible.get("verification_requirements") or {})
    return _canonical_hash({
        "artifact_type": visible.get("artifact_type"),
        "interaction_type": visible.get("interaction_type"),
        "required_assertions": sorted(visible.get("required_assertions") or []),
        "verification_requirements": requirements,
        "control_group_locator": visible.get("control_group_locator"),
        "control_locator": visible.get("control_locator"),
        "action": visible.get("action"),
        "restore_action": visible.get("restore_action"),
    })


def build_pre_dispatch_decision(*, conversation_id: str, goal: str, discussion_context=None,
                                founder_acceptance_criteria=None, founder_constraints=None,
                                task_id: str | None = None, current_route: str | None = None,
                                runtime_available: bool = True, risk: str | None = None,
                                approval_required: bool | None = None,
                                clarification_required: bool | None = None) -> dict:
    """One canonical builder shared by candidate audits and production dispatch."""
    acceptance = list(founder_acceptance_criteria or [])
    constraints = list(founder_constraints or [])
    contract = build_standard_task_contract(
        conversation_id=conversation_id, goal=goal, task_id=task_id,
        discussion_context=list(discussion_context or []),
        founder_acceptance_criteria=acceptance, founder_constraints=constraints,
    )
    scope = dict(contract.get("semantic_scope") or {})
    visible = dict(contract.get("visible_artifact_contract") or {})
    scope_files = _classify_scope_files(list(contract.get("implementation_scope") or []))
    semantic_target = dict(scope.get("semantic_target") or {})
    scope_fingerprint = _canonical_hash({
        "semantic_target": semantic_target,
        "allowed_modules": sorted(scope.get("allowed_modules") or []),
        "production_files": scope_files["allowed_production_files"],
        "test_files": scope_files["allowed_test_files"],
        "shared_support_files": scope_files["allowed_shared_support_files"],
        "authoritative_constraints": _normalized_values(constraints),
    })
    contract_fingerprint = _contract_fingerprint(contract)
    admission = standard_task_dispatch_admission(contract)
    if not runtime_available and admission["status"] == "PASS":
        admission = {
            "status": "BLOCKED", "reason": "Autonomous execution runtime is unavailable before dispatch.",
            "founder_gate_required": False, "codex_dispatch_allowed": False,
        }
    artifact_type = str(visible.get("artifact_type") or "")
    interaction_type = str(visible.get("interaction_type") or "")
    browser_adapter = (
        SUPPORTED_BROWSER_ADAPTERS.get((artifact_type, interaction_type))
        or ("system_chrome_playwright" if visible.get("required") and artifact_type != "generic_visible_interaction" else None)
    )
    authoritative_risk = str(risk or contract.get("risk") or "low").lower()
    authoritative_approval = bool(
        approval_required if approval_required is not None
        else contract.get("approval_required") or authoritative_risk != "low"
    )
    authoritative_clarification = bool(
        clarification_required if clarification_required is not None
        else contract.get("scope_confidence") != "HIGH"
    )
    if authoritative_clarification:
        admission = {"status": "BLOCKED", "reason": "Founder clarification is required before Production readiness.",
                     "founder_gate_required": True, "codex_dispatch_allowed": False}
    elif authoritative_approval:
        admission = {"status": "PENDING_APPROVAL", "reason": "Founder approval is required before execution authorization.",
                     "founder_gate_required": True, "codex_dispatch_allowed": False}
    decision = {
        "semantic_target": semantic_target or None,
        "semantic_module": next(iter(scope.get("allowed_modules") or []), None),
        "interaction_intent": scope.get("interaction_type") or interaction_type or None,
        "semantic_confidence": contract.get("scope_confidence"),
        "allowed_modules": list(scope.get("allowed_modules") or []),
        **scope_files,
        "scope_fingerprint": scope_fingerprint,
        "visible_artifact_contract": deepcopy(visible) or None,
        "contract_fingerprint": contract_fingerprint,
        "verification_requirement": deepcopy(visible.get("verification_requirements") or {}),
        "browser_adapter": browser_adapter,
        "adapter_compatibility": "PASS" if browser_adapter or not visible.get("required") else "BLOCKED",
        "risk": authoritative_risk, "approval_required": authoritative_approval,
        "clarification_required": authoritative_clarification,
        "dispatch_allowed": admission.get("codex_dispatch_allowed") is True,
        "blocked_reason": admission.get("reason"),
        "decision_revision": PRE_DISPATCH_DECISION_REVISION,
        "created_at": _now(),
        "intent_fingerprint": pre_dispatch_intent_fingerprint(
            goal=goal, founder_constraints=constraints,
            founder_acceptance_criteria=acceptance, current_route=current_route,
        ),
        "standard_task_contract": contract,
        "dispatch_admission": admission,
    }
    decision["decision_fingerprint"] = _canonical_hash({
        "intent_fingerprint": decision["intent_fingerprint"],
        "scope_fingerprint": scope_fingerprint,
        "contract_fingerprint": contract_fingerprint,
        "browser_adapter": decision["browser_adapter"],
        "adapter_compatibility": decision["adapter_compatibility"],
        "risk": decision["risk"],
        "approval_required": decision["approval_required"],
        "clarification_required": decision["clarification_required"],
        "dispatch_allowed": decision["dispatch_allowed"],
        "decision_revision": PRE_DISPATCH_DECISION_REVISION,
    })
    return decision


def _new_discussion_three_column_contract(*, conversation_id: str, goal: str, task_id: str | None) -> dict:
    return {
        "task_id": task_id or f"standard-task-{uuid4().hex[:20]}", "conversation_id": conversation_id,
        "task_type": "STANDARD_TASK", "target_surface": "New Discussion",
        "target_route": "DRAFT_DISCUSSION via + 新建讨论",
        "target_component": "ConversationWorkspace / DraftDiscussion / SinoFounderShell",
        "objective": "Render the real New Discussion route as the confirmed three-column Founder workspace.",
        "confirmed_layout": {
            "left": "Projects / Conversations", "center": "Founder ↔ Sino Conversation / Composer",
            "right": "Task Status + Founder Action Queue",
        },
        "acceptance_criteria": [
            "Click the real + 新建讨论 control from localhost.",
            "The left Projects / Conversations column remains visible.",
            "The center Draft Discussion / Composer column is visible.",
            "The right Task Status + Founder Action Queue column is visible.",
            "All three columns are simultaneously visible in the real browser DOM and viewport.",
            "New Discussion remains transient until the first valid submit.",
        ],
        "visible_artifact_contract": {
            "required": True, "artifact_type": "three_column_new_discussion",
            "target_route": "DRAFT_DISCUSSION via + 新建讨论",
            "required_assertions": ["new_discussion_clicked", "left_column_visible", "center_column_visible", "right_column_visible", "three_columns_in_viewport"],
        },
        "constraints": ["preserve_home", "preserve_conversation_workspace", "preserve_transient_draft_creation", "no_backend_business_change"],
        "implementation_scope": [
            "frontend/src/sino-founder/FounderHome.jsx", "frontend/src/sino-founder/ConversationWorkspace.jsx",
            "frontend/src/sino-founder/SinoFounderShell.jsx", "frontend/src/sino-founder/SinoBrainContext.jsx",
            "frontend/src/sino-founder/SinoFounderAIApp.test.jsx", "frontend/src/sino-founder/sino-founder-ai.css",
        ],
        "prohibited_scope": ["conversation_backend", "task_lifecycle", "architecture_change", "external_write", "production_write"],
        "founder_gate_reentry_conditions": ["credential", "incremental_cost", "external_side_effect", "production_impact", "architecture_boundary_change"],
        "inspect_status": "ready_for_plan",
        "implementation_plan": [
            "Resolve the real + 新建讨论 interaction to the DRAFT_DISCUSSION render branch.",
            "Inspect the existing shell, draft composer and task/action-queue projection before editing.",
            "Implement only the confirmed left / center / right ownership on the draft route.",
            "Preserve transient draft creation and existing Home and Conversation behavior.",
            "Run targeted tests, build, and real localhost click-through DOM verification before checkpoint.",
        ],
        "source_goal": goal,
    }


def _founder_sidebar_spacing_contract(*, conversation_id: str, goal: str, task_id: str | None) -> dict:
    return {
        "task_id": task_id or f"standard-task-{uuid4().hex[:20]}", "conversation_id": conversation_id,
        "task_type": "STANDARD_TASK", "target_surface": "Founder Sidebar",
        "target_route": "Sino Founder shell / all Founder views",
        "target_component": "SecretarySidebar / sino-founder-ai.css",
        "objective": "Reduce only the vertical spacing between + 新建讨论 and 项目 in the Founder sidebar.",
        "acceptance_criteria": [
            "The real Founder sidebar renders + 新建讨论 and 项目 closer together.",
            "Projects and Conversations remain functional and visible.",
            "No unrelated sidebar spacing or business behavior changes.",
        ],
        "visible_artifact_contract": {
            "required": True, "artifact_type": "founder_sidebar_spacing",
            "target_route": "Sino Founder shell / all Founder views",
            "required_assertions": ["new_discussion_visible", "projects_visible", "reduced_vertical_gap", "sidebar_actions_functional"],
        },
        "constraints": ["preserve_sidebar_structure", "preserve_navigation_behavior", "visual_spacing_only"],
        "implementation_scope": [
            "frontend/src/sino-founder/SecretarySidebar.jsx", "frontend/src/sino-founder/SecretarySidebar.test.jsx",
            "frontend/src/sino-founder/sino-founder-ai.css",
        ],
        "prohibited_scope": ["conversation_backend", "task_lifecycle", "capability_repository", "external_write", "production_write"],
        "founder_gate_reentry_conditions": ["credential", "incremental_cost", "external_side_effect", "production_impact", "architecture_boundary_change"],
        "inspect_status": "ready_for_plan",
        "implementation_plan": [
            "Inspect the real SecretarySidebar DOM and current spacing rule.",
            "Adjust only the bounded gap between + 新建讨论 and 项目.",
            "Run the sidebar tests, frontend build, and real localhost visual verification.",
        ],
        "source_goal": goal,
    }


def _founder_sidebar_typography_contract(*, conversation_id: str, goal: str, task_id: str | None) -> dict:
    return {
        "task_id": task_id or f"standard-task-{uuid4().hex[:20]}", "conversation_id": conversation_id,
        "task_type": "STANDARD_TASK", "target_surface": "Founder Sidebar",
        "target_route": "Sino Founder shell / all Founder views",
        "target_component": "SecretarySidebar / sino-founder-ai.css",
        "objective": goal,
        "acceptance_criteria": [
            "The actual 项目 and 会话 text elements both have computed font-size 15px and identical font-weight, line-height, letter-spacing, and font-family.",
            "The two heading text elements have no different transform/scale, flex shrink, min-width, width constraint, gap, or text-rendering container rule that can compress one title differently.",
            "A real localhost screenshot shows both headings as visually equal peers under the same typography/layout principle.",
            "No other sidebar layout, navigation, or typography changes.",
        ],
        "visible_artifact_contract": {
            "required": True, "artifact_type": "founder_sidebar_heading_typography",
            "target_route": "Sino Founder shell / all Founder views",
            "required_assertions": [
                "projects_heading_visible", "conversations_heading_visible", "both_headings_15px", "matching_computed_typography",
                "matching_layout_constraints", "no_differential_scale_or_shrink", "visual_heading_parity", "screenshot_evidence_exists",
            ],
        },
        "constraints": ["preserve_sidebar_structure", "preserve_navigation_behavior", "typography_only"],
        "implementation_scope": [
            "frontend/src/sino-founder/SecretarySidebar.jsx", "frontend/src/sino-founder/SecretarySidebar.test.jsx",
            "frontend/src/sino-founder/sino-founder-ai.css",
        ],
        "prohibited_scope": ["conversation_backend", "task_lifecycle", "capability_repository", "external_write", "production_write"],
        "founder_gate_reentry_conditions": ["credential", "incremental_cost", "external_side_effect", "production_impact", "architecture_boundary_change"],
        "inspect_status": "ready_for_plan",
        "implementation_plan": [
            "Inspect the actual 项目 and 会话 text elements plus their immediate heading containers, not only inherited outer font-size.",
            "Unify the bounded typography, icon/text spacing, flex and width constraints so neither title is compressed differently.",
            "Run sidebar tests, frontend build, real localhost computed-style verification, and screenshot comparison.",
        ],
        "source_goal": goal,
    }


def _runtime_url_typography_contract(*, conversation_id: str, goal: str, task_id: str | None) -> dict:
    return {
        "task_id": task_id or f"standard-task-{uuid4().hex[:20]}", "conversation_id": conversation_id,
        "task_type": "STANDARD_TASK", "target_surface": "Settings / System / Runtime",
        "target_route": "Settings → 系统", "target_component": "ModelCenter / RuntimeEnvironmentSettings",
        "objective": "Reduce only the frontend and backend Runtime URL typography by one existing type level.",
        "acceptance_criteria": [
            "The frontend and backend Runtime URL text uses the next smaller existing typography level.",
            "Other Runtime labels, values, layout and behavior remain unchanged.",
            "The real Settings → 系统 Runtime modal confirms both URL computed font sizes.",
        ],
        "visible_artifact_contract": {
            "required": True, "artifact_type": "runtime_url_typography",
            "target_route": "Settings → 系统",
            "required_assertions": ["runtime_modal_visible", "frontend_url_smaller", "backend_url_smaller", "other_runtime_content_unchanged"],
        },
        "constraints": ["typography_only", "preserve_runtime_data", "preserve_runtime_layout", "preserve_health_logic"],
        "implementation_scope": [
            "frontend/src/sino-founder/ModelCenter.jsx", "frontend/src/sino-founder/ModelCenter.test.jsx",
            "frontend/src/sino-founder/sino-founder-ai.css",
        ],
        "module_boundary": [],
        "prohibited_scope": [
            "capability_repository", "conversation", "model_runtime_backend", "provider", "database", "sidebar", "composer", "other_settings_pages",
        ],
        "founder_gate_reentry_conditions": ["credential", "incremental_cost", "external_side_effect", "production_impact", "architecture_boundary_change"],
        "inspect_status": "ready_for_plan",
        "implementation_plan": [
            "Inspect RuntimeEnvironmentSettings and the existing Runtime URL selector.",
            "Adjust only the frontend/backend URL typography using the existing type scale.",
            "Update only the bounded ModelCenter test if required.",
            "Run targeted tests, build, git diff --check and real localhost verification.",
        ],
        "source_goal": goal,
    }


def _sino_product_matrix_contract(*, conversation_id: str, goal: str, task_id: str | None) -> dict:
    return {
        "task_id": task_id or f"standard-task-{uuid4().hex[:20]}", "conversation_id": conversation_id,
        "task_type": "STANDARD_TASK", "target_surface": "Founder Sidebar / Sino AI Product Matrix",
        "target_route": "Sino Founder shell / all Founder views",
        "target_component": "FounderNavigationPanel / FounderWorkspaceIcons / sino-founder-ai.css",
        "objective": "Add a fixed Sino AI product matrix entry above Settings in the Founder sidebar.",
        "acceptance_criteria": [
            "A fixed product matrix entry renders above Settings and outside the scrollable conversation history.",
            "Activating the entry opens Sino Studio AI and Sino Operator AI product destinations.",
            "Unavailable products are visibly marked 即将推出 and do not navigate.",
            "Existing sidebar navigation, history scrolling and Settings remain unchanged.",
        ],
        "visible_artifact_contract": {
            "required": True, "artifact_type": "sino_ai_product_matrix_entry",
            "target_route": "Sino Founder shell / all Founder views",
            "required_assertions": [
                "product_matrix_entry_visible", "entry_above_settings", "entry_fixed_outside_history_scroll",
                "product_matrix_opens", "studio_ai_visible", "operator_ai_visible", "unavailable_products_marked_coming_soon",
            ],
        },
        "constraints": ["preserve_sidebar_navigation", "preserve_history_scroll", "preserve_settings_entry", "frontend_presentation_only"],
        "implementation_scope": [
            "frontend/src/sino-founder/FounderNavigationPanel.jsx",
            "frontend/src/sino-founder/FounderNavigationPanel.test.jsx",
            "frontend/src/sino-founder/FounderWorkspaceIcons.jsx",
            "frontend/src/sino-founder/sino-founder-ai.css",
        ],
        "module_boundary": [],
        "prohibited_scope": [
            "conversation_backend", "task_lifecycle", "capability_repository", "model_center", "provider", "database", "runtime",
        ],
        "founder_gate_reentry_conditions": ["credential", "incremental_cost", "external_side_effect", "production_impact", "architecture_boundary_change"],
        "inspect_status": "ready_for_plan",
        "implementation_plan": [
            "Inspect the existing fixed navigation/footer boundary and icon system.",
            "Add the bounded product matrix trigger and product menu without changing history scrolling.",
            "Represent unavailable destinations with the existing disabled/coming-soon semantics.",
            "Run targeted navigation tests, build, git diff --check and real localhost verification.",
        ],
        "source_goal": goal,
    }


def _sino_product_matrix_typography_contract(*, conversation_id: str, goal: str, task_id: str | None) -> dict:
    return {
        "task_id": task_id or f"standard-task-{uuid4().hex[:20]}", "conversation_id": conversation_id,
        "task_type": "STANDARD_TASK", "target_surface": "Founder Sidebar / Sino AI Product Matrix Typography",
        "target_route": "Sino Founder shell / all Founder views",
        "target_component": "FounderNavigationPanel / sino-founder-ai.css / .sino-sidebar-products",
        "objective": "Reduce only the Sino AI product matrix sidebar label typography to 13px.",
        "acceptance_criteria": [
            "The visible Sino AI 产品矩阵 trigger label has computed font-size 13px.",
            "No other product matrix, sidebar layout, navigation or typography changes.",
        ],
        "visible_artifact_contract": {
            "required": True, "artifact_type": "founder_product_matrix_typography",
            "target_route": "Sino Founder shell / all Founder views",
            "target_label": "Sino AI 产品矩阵", "expected_font_size": "13px",
            "required_assertions": ["product_matrix_entry_visible", "computed_font_size_matches"],
        },
        "constraints": ["typography_only", "preserve_product_matrix_behavior", "preserve_sidebar_layout"],
        "implementation_scope": [
            "frontend/src/sino-founder/FounderNavigationPanel.jsx",
            "frontend/src/sino-founder/FounderNavigationPanel.test.jsx",
            "frontend/src/sino-founder/sino-founder-ai.css",
        ],
        "module_boundary": [],
        "allowed_css_selectors": [".founder-navigation-panel .sino-sidebar-products"],
        "prohibited_scope": [
            "conversation", "capability_repository", "model_center", "runtime", "provider", "database", "sidebar_layout",
        ],
        "founder_gate_reentry_conditions": ["credential", "incremental_cost", "external_side_effect", "production_impact", "architecture_boundary_change"],
        "inspect_status": "ready_for_plan",
        "implementation_plan": [
            "Inspect the existing product matrix trigger typography and shared stylesheet selector.",
            "Change only the product matrix trigger label font-size using the existing type scale.",
            "Run the bounded component test, frontend build, git diff --check and computed-style browser verification.",
        ],
        "source_goal": goal,
    }


def _capability_repository_search_contract(*, conversation_id: str, goal: str, task_id: str | None) -> dict:
    return {
        "task_id": task_id or f"standard-task-{uuid4().hex[:20]}", "conversation_id": conversation_id,
        "task_type": "STANDARD_TASK", "target_surface": "Capability Repository",
        "objective": "Add local search/filter capability for capability name and Domain.",
        "search_fields": ["capability_name", "domain"],
        "acceptance_criteria": [
            "Search by capability name filters matching capabilities.", "Search by Domain filters matching domains and capabilities.",
            "Clearing search restores all results.", "No-result query shows a bounded empty state.",
            "Existing counts, detail navigation, structure and visual style remain intact.",
        ],
        "constraints": ["preserve_existing_page_structure", "preserve_existing_visual_style", "preserve_existing_functionality"],
        "implementation_scope": ["frontend/src/sino-founder/CapabilityWorkspace.jsx", "frontend/src/sino-founder/CapabilityWorkspace.test.jsx", "frontend/src/sino-founder/sino-founder-ai.css"],
        "module_boundary": [],
        "prohibited_scope": ["backend_search_service", "architecture_change", "credential_write", "external_write", "production_write"],
        "founder_gate_reentry_conditions": ["credential", "incremental_cost", "external_side_effect", "production_impact", "architecture_boundary_change"],
        "inspect_status": "ready_for_plan",
        "implementation_plan": [
            "Inspect the existing Domain and capability list data already loaded by CapabilityWorkspace.",
            "Add one local search input in the repository list surface.",
            "Normalize case and whitespace, then match capability name and Domain metadata.",
            "Preserve status counts and detail selection; add a no-results state and clear recovery.",
            "Run targeted frontend tests, build, browser verification and git diff --check.",
        ],
        "source_goal": goal,
    }


def build_standard_task_contract(
    *, conversation_id: str, goal: str, task_id: str | None = None,
    discussion_context: list[str] | None = None,
    founder_acceptance_criteria: list[str] | None = None,
    founder_constraints: list[str] | None = None,
) -> dict:
    from app.founder_ai.semantic_scope import HIGH, resolve_task_scope
    from app.founder_ai.technical_resolution import is_local_health_check_goal
    if is_local_health_check_goal(goal):
        return {
            "task_id": task_id or f"standard-task-{uuid4().hex[:20]}", "conversation_id": conversation_id,
            "task_type": "STANDARD_TASK", "target_surface": "Local Development Environment",
            "implementation_required": False,
            "objective": "Verify Founder frontend, Backend, Database, Worker, Execution Lifecycle and Git Working Tree.",
            "acceptance_criteria": ["Frontend responds", "Backend and Database are healthy", "Lifecycle is healthy", "Git working tree is clean"],
            "constraints": ["application_owned_evidence_only", "no_privileged_cross_app_inspection", "no_business_changes"],
            "implementation_scope": [], "prohibited_scope": ["macos_privacy_changes", "external_calls", "business_code_changes"],
            "founder_gate_reentry_conditions": ["credential", "incremental_cost", "external_side_effect", "production_impact"],
            "inspect_status": "ready_for_reuse_lookup", "implementation_plan": [], "source_goal": goal,
        }
    goal_context = goal.lower()
    combined_context = "\n".join([goal, *(discussion_context or [])]).lower()
    has_new_discussion = ("新建讨论" in combined_context or "draft_discussion" in combined_context)
    has_three_columns = ("3列" in combined_context or "三列" in combined_context) and all(
        marker in combined_context for marker in ("projects", "conversation", "task status")
    )
    if has_new_discussion and has_three_columns:
        return _with_explicit_scope(_new_discussion_three_column_contract(conversation_id=conversation_id, goal=goal, task_id=task_id))
    sidebar_spacing = (("左边栏" in goal_context or "左侧栏" in goal_context or "侧边栏" in goal_context)
                       and "新建讨论" in goal_context and "项目" in goal_context
                       and any(marker in goal_context for marker in ("距离", "间距", "靠近", "调小")))
    if sidebar_spacing:
        return _with_explicit_scope(_founder_sidebar_spacing_contract(conversation_id=conversation_id, goal=goal, task_id=task_id))
    sidebar_typography = (("左边栏" in goal_context or "左侧栏" in goal_context or "侧边栏" in goal_context)
                          and "项目" in goal_context and "会话" in goal_context
                          and any(marker in goal_context for marker in ("字体", "字号", "一样大")))
    if sidebar_typography:
        return _with_explicit_scope(_founder_sidebar_typography_contract(conversation_id=conversation_id, goal=goal, task_id=task_id))
    runtime_url_typography = ("runtime" in goal_context and "url" in goal_context
                              and ("前端" in goal_context or "后端" in goal_context)
                              and any(marker in goal_context for marker in ("字体", "字号", "缩小")))
    if runtime_url_typography:
        return _with_explicit_scope(_runtime_url_typography_contract(conversation_id=conversation_id, goal=goal, task_id=task_id))
    product_matrix_typography = (
        "产品矩阵" in goal_context
        and any(marker in goal_context for marker in ("左侧栏", "左边栏", "侧边栏"))
        and any(marker in goal_context for marker in ("字体", "字号", "字重", "行高", "文字颜色"))
    )
    if product_matrix_typography:
        return _with_explicit_scope(_sino_product_matrix_typography_contract(conversation_id=conversation_id, goal=goal, task_id=task_id))
    product_matrix = (
        any(marker in goal_context for marker in ("产品矩阵", "sino studio ai", "sino operator ai"))
        and any(marker in goal_context for marker in ("左侧栏", "左边栏", "侧边栏", "设置"))
        and any(marker in goal_context for marker in ("入口", "气泡", "菜单"))
        and any(marker in goal_context for marker in ("添加", "增加", "加入", "新增"))
    )
    if product_matrix:
        return _with_explicit_scope(_sino_product_matrix_contract(conversation_id=conversation_id, goal=goal, task_id=task_id))
    capability_search = (("能力仓库" in goal_context or "capability repository" in goal_context)
                         and any(marker in goal_context for marker in ("搜索", "筛选", "search", "filter")))
    if capability_search:
        return _with_explicit_scope(_capability_repository_search_contract(conversation_id=conversation_id, goal=goal, task_id=task_id))
    resolution = resolve_task_scope(goal=goal, risk_level="low")
    if resolution["scope_source"] == "semantic_module" and resolution["confidence"] == HIGH:
        from app.founder_ai.ui_behavior_discovery import (
            discover_existing_ui_controls, extract_acceptance_cardinality,
            extract_founder_acceptance_criteria,
        )
        acceptance_text = "\n".join([goal, *(discussion_context or [])])
        acceptance_cardinality = extract_acceptance_cardinality(acceptance_text)
        existing_behavior = discover_existing_ui_controls(
            repo_root=REPO_ROOT, semantic_scope=resolution, acceptance_text=acceptance_text,
        )
        founder_acceptance = list(dict.fromkeys([
            *[str(item) for item in founder_acceptance_criteria or []],
            *extract_founder_acceptance_criteria(acceptance_text),
        ]))
        target = resolution["allowed_modules"][0]
        contract = {
            "task_id": task_id or f"standard-task-{uuid4().hex[:20]}", "conversation_id": conversation_id,
            "task_type": "STANDARD_TASK", "target_surface": target, "target_component": target,
            "implementation_required": True,
            "objective": goal,
            "acceptance_criteria": [
                *founder_acceptance,
                "The requested UI behavior is implemented within the resolved semantic module.",
                "No denied module or unrelated UI surface changes.",
                "Targeted tests, production build, git diff --check and real localhost UI verification pass.",
            ],
            "constraints": list(dict.fromkeys([
                *[str(item) for item in founder_constraints or []],
                "semantic_module_only", "preserve_unrelated_founder_surfaces", "frontend_presentation_only",
            ])),
            "implementation_scope": resolution["allowed_file_patterns"],
            "module_boundary": [],
            "prohibited_scope": resolution["denied_modules"],
            "semantic_scope": resolution,
            "existing_behavior_discovery": existing_behavior,
            "acceptance_cardinality": acceptance_cardinality,
            "scope_source": "semantic_module", "scope_confidence": HIGH,
            "founder_gate_reentry_conditions": ["credential", "incremental_cost", "external_side_effect", "production_impact", "architecture_boundary_change"],
            "inspect_status": "ready_for_discovery",
            "implementation_plan": [
                "Use read-only repository discovery to confirm the smallest matching component, stylesheet and tests.",
                "Freeze the semantic-module write scope before editing.",
                "Implement only the requested UI behavior and verify changed hunks against the same semantic module.",
                "Run targeted tests, build, git diff --check and real localhost UI verification.",
            ],
            "source_goal": goal,
        }
        contract["scope_classification"] = _classify_scope_files(contract["implementation_scope"])
        from app.founder_ai.visible_artifact_contract import build_generic_visible_artifact_contract
        base_visible_contract = resolution.get("visible_artifact_contract") or build_generic_visible_artifact_contract(
            goal=acceptance_text, semantic_scope=resolution,
            acceptance_cardinality=acceptance_cardinality,
            existing_behavior_discovery=existing_behavior,
        )
        if base_visible_contract:
            if base_visible_contract.get("interaction_type") == "derived_visible_count":
                base_visible_contract["preserved_behaviors"] = list(dict.fromkeys([
                    *list(base_visible_contract.get("preserved_behaviors") or []),
                    *[item for item in founder_acceptance if any(term in item for term in ("保留", "保持", "不变", "preserve"))],
                ]))
            contract["visible_artifact_contract"] = base_visible_contract
        from app.founder_ai.decision_retrieval import inject_decision_context
        contract = inject_decision_context(contract=contract, goal=goal, task_id=task_id, risk_level="low")
        from app.founder_ai.reuse_retrieval import inject_reuse_context
        contract = inject_reuse_context(contract=contract, goal=goal, task_id=task_id)
        from app.founder_ai.playbook_composer import compose_execution_playbook
        contract = compose_execution_playbook(
            contract=contract, task_id=task_id, goal=goal, risk="low",
            founder_constraints=discussion_context,
        )
        from app.founder_ai.visible_artifact_contract import refine_visible_artifact_contract
        refined = refine_visible_artifact_contract(
            base_contract=contract.get("visible_artifact_contract"),
            acceptance_criteria=contract.get("acceptance_criteria"),
            playbook_context=contract.get("playbook_context"),
        )
        if refined:
            contract["visible_artifact_contract"] = refined
        return contract
    from app.founder_ai.ui_behavior_discovery import extract_founder_acceptance_criteria
    acceptance_text = "\n".join([goal, *(discussion_context or [])])
    preserved_acceptance = list(dict.fromkeys([
        *[str(item) for item in founder_acceptance_criteria or []],
        *extract_founder_acceptance_criteria(acceptance_text),
    ]))
    return {
        "task_id": task_id or f"standard-task-{uuid4().hex[:20]}", "conversation_id": conversation_id,
        "task_type": "STANDARD_TASK", "target_surface": "Unresolved bounded task",
        "objective": goal, "acceptance_criteria": [
            *preserved_acceptance, "Resolve the exact semantic target before modifying files.",
        ],
        "constraints": list(dict.fromkeys([
            *[str(item) for item in founder_constraints or []], "read_only_inspection_until_scope_resolved",
        ])), "implementation_scope": [], "module_boundary": [],
        "prohibited_scope": ["all_repository_writes_until_scope_resolved"],
        "founder_gate_reentry_conditions": ["credential", "incremental_cost", "external_side_effect", "production_impact", "architecture_boundary_change"],
        "scope_source": "approval_required", "scope_confidence": resolution["confidence"], "semantic_scope": resolution,
        "inspect_status": "scope_resolution_required", "implementation_plan": ["Resolve target surface, module boundary and expected artifact before dispatch."], "source_goal": goal,
    }


def _with_explicit_scope(contract: dict) -> dict:
    from app.founder_ai.semantic_scope import resolve_task_scope
    contract = dict(contract)
    resolution = resolve_task_scope(goal=str(contract.get("source_goal") or contract.get("objective") or ""), explicit_contract=contract)
    contract["scope_source"] = "explicit_contract"
    contract["scope_confidence"] = resolution["confidence"]
    contract["semantic_scope"] = resolution
    return contract


def _save_route(conversation_id: str, route: dict, *, stage: str = "standard_task") -> dict:
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            raise LookupError("Sino Brain state not found")
        discovery = dict(state.discovery or {})
        discovery["task_complexity_route"] = route
        discovery["standard_task_contract"] = route.get("standard_task_contract")
        state.discovery = discovery; state.stage = stage; state.updated_at = datetime.now(timezone.utc)
        db.commit()
    return route


def begin_standard_task(*, conversation_id: str, goal: str, route: dict, source_message_id: str | None = None) -> dict:
    result = dict(route)
    prior_identity = dict(result.get("task_identity") or {})
    if source_message_id and prior_identity.get("source_message_id") != source_message_id:
        for key in ("autonomous_execution", "technical_blocker", "visible_result", "founder_acceptance"):
            result.pop(key, None)
    result.update({"clarification_required": False, "founder_gate_required": False, "manual_continue_required": False,
                   "manual_continue_count": 0, "manual_codex_instruction_count": 0, "current_step": "inspect",
                   "execution_status": "inspecting", "progress_log": ["inspect"]})
    decision = deepcopy(route.get("canonical_pre_dispatch_decision") or {})
    expected_intent = pre_dispatch_intent_fingerprint(
        goal=goal, founder_constraints=list(route.get("founder_constraints") or []),
        founder_acceptance_criteria=list(route.get("founder_acceptance_criteria") or []),
    )
    if decision and decision.get("intent_fingerprint") != expected_intent:
        raise ValueError("candidate_authority_intent_mismatch")
    if not decision:
        decision = build_pre_dispatch_decision(
            conversation_id=conversation_id, goal=goal,
            discussion_context=list(route.get("discussion_context") or []),
            founder_acceptance_criteria=list(route.get("founder_acceptance_criteria") or []),
            founder_constraints=list(route.get("founder_constraints") or []),
            risk=route.get("risk"), approval_required=route.get("approval_required"),
            clarification_required=route.get("clarification_required"),
        )
    persisted_authority = deepcopy(route.get("candidate_authority") or {})
    if persisted_authority:
        if persisted_authority.get("canonical_fingerprint") != decision.get("decision_fingerprint"):
            raise ValueError("candidate_authority_fingerprint_mismatch")
        if persisted_authority.get("conversation_id") != conversation_id:
            raise ValueError("candidate_authority_conversation_mismatch")
        if source_message_id and persisted_authority.get("source_message_id") != source_message_id:
            raise ValueError("candidate_authority_source_message_mismatch")
        authority = persisted_authority
    else:
        authority = candidate_authority_snapshot(
            decision=decision, conversation_id=conversation_id, source_message_id=source_message_id,
        )
    result["canonical_pre_dispatch_decision"] = decision
    result["candidate_authority"] = authority
    result["standard_task_contract"] = decision["standard_task_contract"]
    result["dispatch_admission"] = decision["dispatch_admission"]
    result["clarification_required"] = authority["clarification_required"]
    result["founder_gate_required"] = bool(
        authority["clarification_required"] or authority["approval_required"]
    )
    if source_message_id:
        from app.founder_ai.task_identity import build_task_identity
        result["task_identity"] = build_task_identity(source_message_id=source_message_id,
            conversation_id=conversation_id, goal=goal,
            target_module=result["standard_task_contract"].get("target_surface"),
            target_object=result["standard_task_contract"].get("target_component"))
    if route.get("discussion_context"):
        result["standard_task_contract"]["confirmed_conversation_context"] = list(route["discussion_context"])
    return _save_route(conversation_id, result)


def _authority_from_task(task: TaskAssetDB) -> dict:
    authority = deepcopy(dict(task.scope or {}).get("candidate_authority") or {})
    required = {
        "candidate_id", "conversation_id", "canonical_fingerprint", "intent_fingerprint",
        "scope_fingerprint", "contract_fingerprint", "contract", "risk",
        "clarification_required", "approval_required", "dispatch_allowed",
    }
    if not required.issubset(authority):
        raise ValueError("task_candidate_authority_incomplete")
    return authority


def _load_route(conversation_id: str) -> dict:
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(
            SinoBrainSessionDB.conversation_id == conversation_id))
        return dict((state.discovery or {}).get("task_complexity_route") or {}) if state else {}


def prepare_standard_task(*, conversation_id: str, goal: str,
                          source_message_id: str | None = None) -> dict:
    """Persist a Production-ready TaskAsset without creating or enqueueing an Execution."""
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(
            SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        route = dict((state.discovery or {}).get("task_complexity_route") or {}) if state else {}
    if route.get("classification") != "STANDARD_TASK":
        return route
    authority = deepcopy(route.get("candidate_authority") or {})
    decision = deepcopy(route.get("canonical_pre_dispatch_decision") or {})
    if not authority and not decision:
        route = begin_standard_task(
            conversation_id=conversation_id, goal=goal, route=route,
            source_message_id=source_message_id,
        )
        authority = deepcopy(route.get("candidate_authority") or {})
        decision = deepcopy(route.get("canonical_pre_dispatch_decision") or {})
    if not authority or authority.get("canonical_fingerprint") != decision.get("decision_fingerprint"):
        route["execution_status"] = "blocked"
        route["technical_blocker"] = {"type": "candidate_authority_missing_or_mismatched",
                                      "terminal_status": "BLOCKED",
                                      "reason": "A matching persisted Candidate authority is required."}
        return _save_route(conversation_id, route)
    if authority.get("clarification_required"):
        route["dispatch_admission"] = deepcopy(decision.get("dispatch_admission") or {})
        route["standard_task_contract"] = deepcopy(authority.get("contract") or {})
        route["execution_status"] = "blocked"
        route["technical_blocker"] = {"type": "standard_task_pre_dispatch_admission", "terminal_status": "BLOCKED",
                                      "reason": authority.get("blocked_reason") or "Founder clarification is required before Production readiness."}
        return _save_route(conversation_id, route)
    if not authority.get("dispatch_allowed") and not authority.get("approval_required"):
        route["dispatch_admission"] = deepcopy(decision.get("dispatch_admission") or {})
        route["standard_task_contract"] = deepcopy(authority.get("contract") or {})
        route["execution_status"] = "blocked"
        route["technical_blocker"] = {"type": "standard_task_pre_dispatch_admission", "terminal_status": "BLOCKED",
                                      "reason": authority.get("blocked_reason") or "Candidate admission is blocked."}
        return _save_route(conversation_id, route)
    contract = deepcopy(authority["contract"])
    task_scope = {
        "lane": "STANDARD_TASK", "target_surface": contract["target_surface"],
        "target_route": contract.get("target_route"), "target_component": contract.get("target_component"),
        "candidate_authority": authority,
        "production_readiness": {"status": "preparing", "prepared_at": _now()},
    }
    approval_status = "pending" if authority.get("approval_required") else "not_required"
    task = create_task_asset(
        title=goal[:200], description=goal, conversation_id=conversation_id, scope=task_scope,
        status="draft", approval_status=approval_status, execution_status="prepared",
        source_message_id=source_message_id, target_module=contract.get("target_surface"),
        target_object=contract.get("target_component"),
    )
    if getattr(task, "duplicate_reason", None):
        authority = _authority_from_task(task)
    else:
        from app.founder_ai.reuse_retrieval import inject_reuse_context
        enriched_contract = inject_reuse_context(
            contract=contract, goal=goal, task_id=task.id, session_factory=SessionLocal,
        )
        reuse_lookup = deepcopy(enriched_contract.get("reuse_lookup") or {})
        authority["reuse"] = {
            "attempted": bool(reuse_lookup),
            "matched": bool(reuse_lookup.get("reuse_applied")),
            "reference": reuse_lookup.get("reuse_evidence_id"),
            "candidate_count": reuse_lookup.get("reuse_candidate_count", 0),
            "compatibility": reuse_lookup.get("reuse_compatibility"),
            "reason": None if reuse_lookup.get("reuse_applied") else "no_compatible_reuse_asset",
            "context": deepcopy(enriched_contract.get("reuse_context") or {}),
        }
        with SessionLocal() as db:
            record = db.get(TaskAssetDB, task.id)
            updated_scope = dict(record.scope or {})
            updated_scope["candidate_authority"] = authority
            updated_scope["production_readiness"] = {
                "status": "pending_approval" if authority.get("approval_required") else "ready",
                "prepared_at": _now(), "canonical_fingerprint": authority["canonical_fingerprint"],
            }
            record.scope = updated_scope
            record.status = "draft"
            record.execution_status = "prepared"
            db.commit(); db.refresh(record); task = record
    if authority.get("approval_required") or str(authority.get("risk") or "low").lower() != "low":
        pending_approval = ensure_task_execution_approval(
            task_id=task.id, candidate_id=authority["candidate_id"],
            canonical_fingerprint=authority["canonical_fingerprint"],
        )
        _sync_execution_approval_action(
            conversation_id=conversation_id, task_id=task.id,
            authority=authority, approval=pending_approval,
        )
    route["candidate_authority"] = authority
    route["standard_task_contract"] = deepcopy(authority["contract"])
    route["production_ready"] = {
        "status": "pending_approval" if authority.get("approval_required") else "ready",
        "task_id": task.id, "candidate_id": authority["candidate_id"],
        "canonical_fingerprint": authority["canonical_fingerprint"],
        "prepared_at": _now(),
    }
    route["execution_status"] = "prepared"
    route.pop("technical_blocker", None)
    return _save_route(conversation_id, route)


def restore_production_ready_task(task_id: str) -> dict:
    """Restore Production readiness solely from the durable TaskAsset boundary."""
    with SessionLocal() as db:
        task = db.get(TaskAssetDB, task_id)
        if task is None:
            raise LookupError("production_ready_task_not_found")
        authority = _authority_from_task(task)
        readiness = deepcopy(dict(task.scope or {}).get("production_readiness") or {})
        if readiness.get("canonical_fingerprint") != authority["canonical_fingerprint"]:
            raise ValueError("production_readiness_fingerprint_mismatch")
        if authority.get("clarification_required"):
            authorization = "blocked_clarification"
        elif authority.get("approval_required"):
            approval = validate_task_execution_approval(task, authority)
            authorization = "execution_authorized" if approval["authorized"] else approval["reason"]
        elif authority.get("dispatch_allowed") or authority.get("approval_required"):
            authorization = "execution_authorized"
        else:
            authorization = "blocked"
        return {
            "task_id": task.id, "conversation_id": task.conversation_id,
            "source_message_id": authority.get("source_message_id"),
            "candidate_authority": authority, "production_readiness": readiness,
            "authorization": authorization, "execution_status": task.execution_status,
        }


def start_prepared_standard_task(*, conversation_id: str, enqueue=enqueue_execution) -> dict:
    """Authorize a persisted Production-ready TaskAsset, then create and enqueue Execution."""
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(
            SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        route = dict((state.discovery or {}).get("task_complexity_route") or {}) if state else {}
        ready = dict(route.get("production_ready") or {})
        task = db.scalar(select(TaskAssetDB).where(
            TaskAssetDB.id == ready.get("task_id")).with_for_update()) if ready.get("task_id") else None
        if task is None:
            return route
        authority = _authority_from_task(task)
        if authority["canonical_fingerprint"] != ready.get("canonical_fingerprint"):
            raise ValueError("production_authority_fingerprint_mismatch")
        if authority.get("clarification_required") or (
            not authority.get("dispatch_allowed") and not authority.get("approval_required")
        ):
            task.execution_status = "blocked"; db.commit()
            route["execution_status"] = "blocked"
            return _save_route(conversation_id, route)
        approval = validate_task_execution_approval(task, authority)
        if not approval["authorized"]:
            if approval["reason"] == "blocked_stale_approval":
                invalidate_task_execution_approval(task, reason="canonical_fingerprint_mismatch")
                db.commit()
            route["execution_status"] = (
                "pending_approval" if approval["reason"] == "blocked_approval_missing"
                else "blocked"
            )
            route["founder_gate_required"] = True
            route["execution_authorization"] = {
                "status": "blocked", "reason": approval["reason"],
                "approval_id": (approval.get("approval") or {}).get("approval_id"),
            }
            return _save_route(conversation_id, route)
        execution_id = stable_execution_id(
            task_id=task.id, canonical_fingerprint=authority["canonical_fingerprint"],
        )
        task_scope = dict(task.scope or {})
        prior_start = dict(task_scope.get("execution_start") or {})
        if prior_start:
            if (
                prior_start.get("execution_id") != execution_id
                or prior_start.get("canonical_fingerprint") != authority["canonical_fingerprint"]
            ):
                raise ValueError("execution_start_authority_mismatch")
            route["execution_status"] = prior_start.get("status") or task.execution_status
            route["autonomous_execution"] = {
                **dict(route.get("autonomous_execution") or {}),
                "task_id": task.id, "execution_session_id": execution_id,
                "dispatch_status": prior_start.get("status") or task.execution_status,
                "duplicate_start_reused": True,
            }
            return _save_route(conversation_id, route)
        started_at = _now()
        task_scope["execution_start"] = {
            "schema_version": "execution-start-v1", "execution_id": execution_id,
            "task_id": task.id, "candidate_id": authority["candidate_id"],
            "canonical_fingerprint": authority["canonical_fingerprint"],
            "status": "starting", "started_at": started_at,
        }
        task.scope = task_scope
        task.status = "in_progress"
        task.execution_status = "starting"
        task_id, task_title = task.id, task.title
        task_description = task.description or task.title
        db.commit()
        route["execution_status"] = "starting"
        route["execution_authorization"] = {
            "status": "authorized", "reason": approval["reason"],
            "approval_id": (approval.get("approval") or {}).get("approval_id"),
        }
        route["autonomous_execution"] = {
            **dict(route.get("autonomous_execution") or {}),
            "task_id": task_id, "execution_session_id": execution_id,
            "dispatch_status": "starting", "started_at": started_at,
        }
        _save_route(conversation_id, route)
    contract = deepcopy(authority["contract"])
    reuse = deepcopy(authority.get("reuse") or {})
    if reuse.get("attempted"):
        contract["reuse_lookup"] = {
            "reuse_evidence_id": reuse.get("reference"),
            "reuse_candidate_count": reuse.get("candidate_count", 0),
            "reuse_compatibility": reuse.get("compatibility"),
            "reuse_applied": bool(reuse.get("matched")),
        }
    if reuse.get("context"):
        contract["reuse_context"] = reuse["context"]
    draft = TaskAssetDraft(
        title=task_title, description=task_description, conversation_id=conversation_id,
        scope={"goal_type": "development", "context": {"candidate_authority": authority,
            "standard_task_contract": contract,
            "relevant_files": [{"path": path, "reason": "Frozen Candidate authority scope"}
                               for path in contract["implementation_scope"]]}},
        constraints=[f"Only modify {contract['implementation_scope']}",
                     f"Never perform {contract['prohibited_scope']}",
                     "Do not enter Strategy Meeting or request technical approval."],
        risk=str(authority["risk"]), approval_required=bool(authority["approval_required"]),
    )
    verification = [*contract["acceptance_criteria"], "targeted frontend tests", "frontend build", "git diff --check"]
    if contract.get("visible_artifact_contract"):
        verification.append(f"Write real browser evidence to .founder-execution/visible-artifact-{task_id}.json only after every required DOM assertion passes")
    package = ExecutionPackage(
        goal=contract["objective"], context=dict(draft.scope["context"]), task_asset=draft,
        constraints=list(draft.constraints), verification=verification,
        commit_requirement="Use exact-file Autonomous Checkpoint; do not push.",
        approval_required=draft.approval_required, execution_allowed=True,
    )
    try:
        execution = create_execution_session(task_id, package, execution_id=execution_id)
    except TypeError as error:
        # Preserve compatibility with injected legacy test factories; Production accepts execution_id.
        if "execution_id" not in str(error):
            raise
        execution = create_execution_session(task_id, package)
    execution.status = "approved"
    execution.approved_at = getattr(execution, "approved_at", None) or _now()
    execution.scope_fingerprint = authority["canonical_fingerprint"]
    execution.handoff_id = execution.handoff_id or f"standard-handoff-{uuid4().hex[:20]}"
    execution.readiness_contract_id = execution.readiness_contract_id or f"standard-readiness-{uuid4().hex[:20]}"
    save_execution_session(execution, package)
    try:
        enqueue(execution.id)
    except Exception as error:
        failed_at = _now()
        failure_reason = f"EXECUTION_ENQUEUE_FAILED: {type(error).__name__}: {error}"
        execution.status = "failed"
        execution.failure_reason = failure_reason
        execution.error_message = str(error)
        execution.completed_at = failed_at
        execution.result = {"failure_type": "enqueue_failure", "failure_reason": failure_reason,
                            "failed_at": failed_at, "execution_id": execution.id, "task_id": task_id}
        append_event(execution, "failed", status="failed", message=failure_reason,
                     timestamp=failed_at, metadata={"failure_type": "enqueue_failure"})
        save_execution_session(execution, package)
        with SessionLocal() as db:
            record = db.scalar(select(TaskAssetDB).where(TaskAssetDB.id == task_id).with_for_update())
            scope = dict(record.scope or {}); start = dict(scope.get("execution_start") or {})
            start.update({"status": "failed", "failed_at": failed_at, "failure_reason": failure_reason})
            scope["execution_start"] = start; record.scope = scope
            record.status = "failed"; record.execution_status = "failed"
            record.result = deepcopy(execution.result); db.commit()
        route["execution_status"] = "failed"
        route["technical_blocker"] = {
            "type": "execution_enqueue_failed", "terminal_status": "FAILED",
            "reason": failure_reason, "execution_id": execution.id,
        }
        route["autonomous_execution"] = {
            **dict(route.get("autonomous_execution") or {}),
            "task_id": task_id, "execution_package_id": execution.execution_package_id,
            "execution_session_id": execution.id, "dispatch_status": "failed",
            "failure_reason": failure_reason, "failed_at": failed_at,
        }
        return _save_route(conversation_id, route)
    queued_at = execution.queued_at or _now()
    execution.status = "queued"; execution.queued_at = queued_at
    save_execution_session(execution, package)
    with SessionLocal() as db:
        record = db.scalar(select(TaskAssetDB).where(TaskAssetDB.id == task_id).with_for_update())
        scope = dict(record.scope or {}); start = dict(scope.get("execution_start") or {})
        start.update({"status": "queued", "queued_at": queued_at})
        scope["execution_start"] = start; record.scope = scope
        record.status = "in_progress"; record.execution_status = "queued"; db.commit()
    route["execution_status"] = "queued"
    route.pop("technical_blocker", None)
    route["autonomous_execution"] = {
        **dict(route.get("autonomous_execution") or {}),
        "task_id": task_id, "execution_package_id": execution.execution_package_id,
        "readiness_contract_id": execution.readiness_contract_id, "handoff_id": execution.handoff_id,
        "execution_session_id": execution.id, "executor": "codex", "dispatch_status": "queued",
        "dispatched_at": queued_at, "manual_codex_instruction_count": 0,
    }
    route = _save_route(conversation_id, route)
    Thread(target=_monitor, args=(conversation_id, task_id, execution.id), daemon=True,
           name=f"standard-{execution.id}").start()
    return route


def decide_and_resume_standard_task(*, conversation_id: str, task_id: str, candidate_id: str,
                                    canonical_fingerprint: str, decision: str,
                                    actor: str = "founder", enqueue=enqueue_execution) -> dict:
    """Resolve canonical approval and continue through the one execution-start authority."""
    with SessionLocal() as db:
        task = db.get(TaskAssetDB, task_id)
        if task is None or task.conversation_id != conversation_id:
            raise LookupError("task_asset_not_found")
        authority = _authority_from_task(task)
        if (authority.get("candidate_id") != candidate_id
                or authority.get("canonical_fingerprint") != canonical_fingerprint):
            raise ValueError("stale_execution_approval")
    approval = decide_task_execution_approval(
        task_id=task_id, decision=decision, canonical_fingerprint=canonical_fingerprint,
        candidate_id=candidate_id, actor=actor,
    )
    _sync_execution_approval_action(
        conversation_id=conversation_id, task_id=task_id, authority=authority,
        approval=approval, status="resolved",
    )
    if decision == "rejected":
        with SessionLocal() as db:
            task = db.get(TaskAssetDB, task_id)
            task.status = "rejected"
            task.execution_status = "rejected"
            source_event_id = f"execution-approval-rejected:{approval['approval_id']}"
            existing = db.scalars(select(ConversationMessageDB).where(
                ConversationMessageDB.conversation_id == conversation_id,
                ConversationMessageDB.message_type == "execution_update",
            )).all()
            if not any((item.grounding or {}).get("source_event_id") == source_event_id for item in existing):
                db.add(ConversationMessageDB(
                    conversation_id=conversation_id, role="assistant",
                    message_type="execution_update", intent="approval_rejected",
                    content="Founder 已拒绝执行审批；任务未执行。",
                    grounding={"visibility": "founder", "source_event_id": source_event_id,
                               "task_id": task_id, "approval_id": approval["approval_id"]},
                ))
            db.commit()
        route = _load_route(conversation_id)
        route["execution_status"] = "rejected"
        route["execution_authorization"] = {
            "status": "blocked", "reason": "blocked_approval_rejected",
            "approval_id": approval["approval_id"],
        }
        return {"approval": approval, "route": _save_route(conversation_id, route), "resumed": False}
    route = start_prepared_standard_task(conversation_id=conversation_id, enqueue=enqueue)
    return {"approval": approval, "route": route,
            "resumed": bool((route.get("autonomous_execution") or {}).get("execution_session_id"))}


def _project(conversation_id: str, *, step: str, execution: dict | None = None, blocker: dict | None = None) -> dict:
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        discovery = dict(state.discovery or {}); route = dict(discovery.get("task_complexity_route") or {})
        current = route.get("current_step") or "inspect"
        if STEPS.index(step) >= STEPS.index(current):
            route["current_step"] = step
            route["progress_log"] = list(dict.fromkeys([*(route.get("progress_log") or []), *STEPS[STEPS.index(current):STEPS.index(step)+1]]))
        terminal_status = str((blocker or {}).get("terminal_status") or "").lower()
        route["execution_status"] = "completed" if step == "complete" else terminal_status if terminal_status in {"blocked", "failed"} else "blocked" if blocker else step
        route["manual_continue_required"] = False; route["manual_continue_count"] = 0; route["manual_codex_instruction_count"] = 0
        if execution: route["autonomous_execution"] = {**dict(route.get("autonomous_execution") or {}), **execution}
        if blocker: route["technical_blocker"] = blocker
        elif step == "complete": route.pop("technical_blocker", None)
        discovery["task_complexity_route"] = route; discovery["standard_task_contract"] = route.get("standard_task_contract")
        state.discovery = discovery; state.updated_at = datetime.now(timezone.utc); db.commit()
        return route


def project_scope_mismatch(*, conversation_id: str, execution_id: str, evidence: dict) -> dict:
    scope = dict(evidence.get("scope_verification") or {})
    return _project(conversation_id, step="verification", blocker={
        "type": "standard_task_scope_mismatch", "terminal_status": "BLOCKED",
        "reason": "Current execution changed files outside the frozen task scope.",
        "scope_verification": scope, "founder_gate_required": False,
    }, execution={"execution_session_id": execution_id, "dispatch_status": "blocked", "scope_verification": scope})


def standard_task_dispatch_admission(contract: dict) -> dict:
    """Stop unresolved writable work before a Task or Codex execution is created."""
    implementation_required = contract.get("implementation_required", True) is not False
    scope = list(contract.get("implementation_scope") or [])
    confidence = str(contract.get("scope_confidence") or "")
    if implementation_required and (confidence != "HIGH" or not scope):
        return {
            "status": "BLOCKED", "reason": "Semantic target and bounded write scope must resolve before Codex dispatch.",
            "founder_gate_required": confidence not in {"LOW", "MEDIUM"}, "codex_dispatch_allowed": False,
        }
    semantic = dict(contract.get("semantic_scope") or {})
    interaction_type = str(semantic.get("interaction_type") or "")
    if implementation_required and interaction_type == "generic_control_state":
        visible = dict(contract.get("visible_artifact_contract") or {})
        classified = _classify_scope_files(scope)
        if (
            not dict(semantic.get("semantic_target") or {})
            or len(classified.get("allowed_production_files") or []) > 3
            or visible.get("interaction_type") != "generic_control_state"
        ):
            return {
                "status": "BLOCKED",
                "reason": "Generic control-state target, bounded component scope and browser contract must resolve before Codex dispatch.",
                "founder_gate_required": False,
                "codex_dispatch_allowed": False,
            }
    visible_ui = bool(semantic.get("interaction_type") or semantic.get("semantic_target"))
    visible_contract = dict(contract.get("visible_artifact_contract") or {})
    if implementation_required and visible_ui and not visible_contract.get("required"):
        return {
            "status": "BLOCKED", "reason": "Visible UI verification contract must exist before Codex dispatch.",
            "founder_gate_required": False, "codex_dispatch_allowed": False,
        }
    if implementation_required and visible_contract.get("required"):
        artifact_type = str(visible_contract.get("artifact_type") or "")
        interaction_type = str(visible_contract.get("interaction_type") or "")
        supported = artifact_type != "generic_visible_interaction" or interaction_type in {
            "search_clear", "derived_visible_count", "generic_control_state",
        }
        if not supported:
            return {
                "status": "BLOCKED",
                "reason": "Required visible verification contract has no compatible browser adapter.",
                "founder_gate_required": False, "codex_dispatch_allowed": False,
            }
    return {"status": "PASS", "reason": None, "founder_gate_required": False, "codex_dispatch_allowed": True}


def dispatch_standard_task(*, conversation_id: str, goal: str, source_message_id: str | None = None,
                           enqueue=enqueue_execution) -> dict:
    route = prepare_standard_task(
        conversation_id=conversation_id, goal=goal, source_message_id=source_message_id,
    )
    if route.get("execution_status") != "prepared":
        return route
    return start_prepared_standard_task(conversation_id=conversation_id, enqueue=enqueue)


def reconcile_standard_task_target_and_resume(*, conversation_id: str, enqueue=enqueue_execution) -> dict:
    """Replace a mis-targeted execution with an immutable revision on the same Task lineage."""
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            raise LookupError("Sino Brain state not found")
        discovery = dict(state.discovery or {}); route = dict(discovery.get("task_complexity_route") or {})
        previous = dict(route.get("autonomous_execution") or {})
        task_id = previous.get("task_id")
        previous_execution_id = previous.get("execution_session_id")
        if not task_id or not previous_execution_id:
            raise LookupError("Standard Task execution lineage not found")
        discussion_context = list(route.get("discussion_context") or [])
        goal = (route.get("standard_task_contract") or {}).get("source_goal") or (discussion_context[-1] if discussion_context else "")
        contract = build_standard_task_contract(conversation_id=conversation_id, goal=goal, task_id=task_id, discussion_context=discussion_context)
        if contract["target_surface"] == (route.get("standard_task_contract") or {}).get("target_surface"):
            return route
        old_record = get_execution_session(previous_execution_id)
        if old_record:
            old_session, old_package = old_record
            old_session.source_status = old_session.status
            old_session.status = "cancelled"
            old_session.failure_reason = "task_target_resolution_misclassification"
            append_event(old_session, "cancelled_due_to_route_misclassification", status="cancelled", message="Execution superseded after canonical target reconciliation", metadata={"cancellation_reason": "task_target_resolution_misclassification"})
            save_execution_session(old_session, old_package)
        task = db.get(TaskAssetDB, task_id)
        if task:
            task.scope = {"lane": "STANDARD_TASK", "target_surface": contract["target_surface"], "target_route": contract.get("target_route"), "target_component": contract.get("target_component")}
            task.status = "in_progress"; task.execution_status = "inspecting"
        corrections = {
            "implementation_completed": "上一执行返回的结果与当前任务目标不一致，未计入当前任务完成证据。",
            "verification_completed": "上一执行的验证证据不属于当前目标，当前任务仍需完成正确验证。",
            "execution_completed": "上一执行器已经结束，但当前任务尚未完成；Sino 正在同一任务中重新对账。",
        }
        messages = db.scalars(select(ConversationMessageDB).where(
            ConversationMessageDB.conversation_id == conversation_id,
            ConversationMessageDB.message_type == "execution_update",
        )).all()
        for message in messages:
            grounding = dict(message.grounding or {})
            semantic = grounding.get("event_type")
            if grounding.get("task_id") == task_id and semantic in corrections:
                grounding["event_type"] = f"superseded_{semantic}"
                grounding["superseded_execution_id"] = previous_execution_id
                message.grounding = grounding; message.content = corrections[semantic]
        route["standard_task_contract"] = contract
        route["current_step"] = "inspect"; route["execution_status"] = "inspecting"
        route["stall_detected"] = False
        route["visible_artifact_verification"] = {"status": "FAIL", "completion_allowed": False, "reason": "previous_execution_did_not_verify_target_artifact"}
        route.pop("technical_blocker", None); route.pop("technical_resolution_contract", None)
        discovery["task_complexity_route"] = route; discovery["standard_task_contract"] = contract
        state.discovery = discovery; state.updated_at = datetime.now(timezone.utc); db.commit()
    draft = TaskAssetDraft(title=contract["objective"][:200], description=contract["objective"], conversation_id=conversation_id,
        scope={"goal_type": "development", "context": {"standard_task_contract": contract,
            "relevant_files": [{"path": path, "reason": "Canonical target scope"} for path in contract["implementation_scope"]]}},
        constraints=[f"Only modify {contract['implementation_scope']}", f"Never perform {contract['prohibited_scope']}", "Do not mark complete without the required real browser evidence."],
        risk="low", approval_required=False)
    verification = [*contract["acceptance_criteria"], "targeted frontend tests", "frontend build", "git diff --check",
        f"Write real browser evidence to .founder-execution/visible-artifact-{task_id}.json only after every required DOM assertion passes"]
    package = ExecutionPackage(goal=contract["objective"], context=dict(draft.scope["context"]), task_asset=draft,
        constraints=list(draft.constraints), verification=verification, commit_requirement="Use exact-file Autonomous Checkpoint; do not push.", approval_required=False, execution_allowed=True)
    execution = create_execution_session(task_id, package); execution.status = "queued"; execution.queued_at = _now()
    execution.handoff_id = f"standard-reconcile-handoff-{uuid4().hex[:20]}"; execution.readiness_contract_id = f"standard-reconcile-readiness-{uuid4().hex[:20]}"
    execution.deltas.append({"type": "target_reconciliation", "supersedes_execution_id": previous_execution_id, "reason": "task_target_resolution_misclassification", "created_at": _now()})
    save_execution_session(execution, package)
    route = _project(conversation_id, step="execution", execution={"task_id": task_id, "execution_package_id": execution.execution_package_id,
        "readiness_contract_id": execution.readiness_contract_id, "handoff_id": execution.handoff_id, "execution_session_id": execution.id,
        "supersedes_execution_id": previous_execution_id, "executor": "codex", "dispatch_status": "queued", "dispatched_at": _now(), "manual_codex_instruction_count": 0})
    enqueue(execution.id)
    Thread(target=_monitor, args=(conversation_id, task_id, execution.id), daemon=True, name=f"standard-reconcile-{execution.id}").start()
    return route


def continue_standard_task_verification(
    *, conversation_id: str, failed_evidence: dict, enqueue=enqueue_execution,
) -> dict:
    """Create one immutable same-task revision for a real failed/missing verification delta."""
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            raise LookupError("Sino Brain state not found")
        discovery = dict(state.discovery or {}); route = dict(discovery.get("task_complexity_route") or {})
        previous = dict(route.get("autonomous_execution") or {})
        task_id = previous.get("task_id"); previous_execution_id = previous.get("execution_session_id")
        contract = dict(route.get("standard_task_contract") or {})
        if route.get("classification") != "STANDARD_TASK" or not task_id or not previous_execution_id or not contract:
            raise LookupError("Standard Task verification lineage not found")
        previous_record = get_execution_session(previous_execution_id)
        if previous_record is None or previous_record[0].status != "completed":
            raise ValueError("Verification continuation requires a terminal source execution")
        task = db.get(TaskAssetDB, task_id)
        if task:
            task.status = "in_progress"; task.execution_status = "verifying"
        corrections = {
            "verification_completed": "Founder 已补充更完整的排版验收标准；此前仅比较外层 font-size 的验证不再构成 PASS。",
            "execution_completed": "当前任务尚未完成，Sino 正按同级标题的完整排版规则继续修正和验证。",
            "founder_acceptance_required": "此前验收入口已撤回；完整 computed typography、布局约束和截图尚需重新验证。",
        }
        for message in db.scalars(select(ConversationMessageDB).where(
            ConversationMessageDB.conversation_id == conversation_id,
            ConversationMessageDB.message_type == "execution_update",
        )).all():
            grounding = dict(message.grounding or {}); semantic = grounding.get("event_type")
            if grounding.get("task_id") == task_id and semantic in corrections:
                grounding["event_type"] = f"superseded_{semantic}"
                grounding["superseded_execution_id"] = previous_execution_id
                message.grounding = grounding; message.content = corrections[semantic]
        route["current_step"] = "verification"; route["execution_status"] = "verifying"
        route["visible_artifact_verification"] = {
            "status": "FAIL", "completion_allowed": False, "evidence": failed_evidence,
        }
        route.pop("founder_acceptance", None); route.pop("visible_result", None)
        route.pop("technical_blocker", None); route.pop("technical_resolution_contract", None)
        discovery["task_complexity_route"] = route; state.discovery = discovery; state.updated_at = datetime.now(timezone.utc)
        db.commit()
    draft = TaskAssetDraft(
        title=contract["objective"][:200], description=contract["objective"], conversation_id=conversation_id,
        scope={"goal_type": "development", "context": {
            "standard_task_contract": contract, "verification_continuation": {
                "supersedes_execution_id": previous_execution_id, "failed_evidence": failed_evidence,
                "instruction": "Preserve the current task-owned implementation, correct only the verified delta, then complete real localhost verification and checkpoint.",
            },
            "relevant_files": [{"path": path, "reason": "Canonical task-owned scope"} for path in contract["implementation_scope"]],
        }},
        constraints=[f"Only modify {contract['implementation_scope']}", "Do not repeat unrelated implementation.", "Do not mark complete without required real browser evidence."],
        risk="low", approval_required=False,
    )
    verification = [
        *contract["acceptance_criteria"], "targeted frontend tests", "frontend build", "git diff --check",
        "Use local Playwright verification when the embedded browser is unavailable.",
        f"Write real browser evidence to .founder-execution/visible-artifact-{task_id}.json only after every required DOM assertion passes",
    ]
    package = ExecutionPackage(
        goal=contract["objective"], context=dict(draft.scope["context"]), task_asset=draft,
        constraints=list(draft.constraints), verification=verification,
        commit_requirement="Use exact-file Autonomous Checkpoint; do not push.", approval_required=False, execution_allowed=True,
    )
    execution = create_execution_session(task_id, package); execution.status = "queued"; execution.queued_at = _now()
    execution.handoff_id = f"standard-verification-handoff-{uuid4().hex[:20]}"
    execution.readiness_contract_id = f"standard-verification-readiness-{uuid4().hex[:20]}"
    execution.deltas.append({"type": "verification_continuation", "supersedes_execution_id": previous_execution_id, "failed_evidence": failed_evidence, "created_at": _now()})
    save_execution_session(execution, package)
    route = _project(conversation_id, step="verification", execution={
        "task_id": task_id, "execution_package_id": execution.execution_package_id,
        "readiness_contract_id": execution.readiness_contract_id, "handoff_id": execution.handoff_id,
        "execution_session_id": execution.id, "supersedes_execution_id": previous_execution_id,
        "executor": "codex", "dispatch_status": "queued", "dispatched_at": _now(), "manual_codex_instruction_count": 0,
    })
    enqueue(execution.id)
    Thread(target=_monitor, args=(conversation_id, task_id, execution.id), daemon=True, name=f"standard-verification-{execution.id}").start()
    return route


def reconcile_standard_task_acceptance_contract(*, conversation_id: str) -> dict:
    """Rebuild the current bounded contract after Founder corrects its acceptance meaning."""
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            raise LookupError("Sino Brain state not found")
        discovery = dict(state.discovery or {}); route = dict(discovery.get("task_complexity_route") or {})
        current = dict(route.get("standard_task_contract") or {})
        if current.get("target_surface") != "Founder Sidebar" or current.get("visible_artifact_contract", {}).get("artifact_type") != "founder_sidebar_heading_typography":
            raise ValueError("Current task is not the Sidebar Typography task")
        contract = _founder_sidebar_typography_contract(
            conversation_id=conversation_id, goal=current.get("source_goal") or current.get("objective") or "",
            task_id=current.get("task_id"),
        )
        route["standard_task_contract"] = contract; discovery["standard_task_contract"] = contract
        discovery["task_complexity_route"] = route; state.discovery = discovery; state.updated_at = datetime.now(timezone.utc)
        db.commit()
        return contract


def _monitor(conversation_id: str, task_id: str, execution_id: str) -> None:
    while True:
        record = get_execution_session(execution_id)
        if record is None: return
        session, _ = record
        if session.status in {"queued", "executing", "testing"}:
            from app.founder_ai.technical_resolution import evaluate_stall, mark_stalled_execution
            stall = evaluate_stall(session)
            if stall["stalled"]:
                mark_stalled_execution(conversation_id=conversation_id, execution_id=execution_id, stall_evidence=stall)
        if session.status == "testing": _project(conversation_id, step="verification", execution={"dispatch_status": "verifying"})
        if session.status in {"completed", "failed", "blocked", "cancelled"}: break
        time.sleep(.25)
    reconcile_standard_task_execution(conversation_id=conversation_id, task_id=task_id, execution_id=execution_id)


def evaluate_standard_verification_evidence(
    *,
    implementation_complete: bool,
    task_owned_tests_pass: bool,
    build_pass: bool,
    visible_artifact_pass: bool,
    checkpoint_exists: bool,
    task_owned_files_clean: bool,
    scope_verification_pass: bool = True,
    diff_check_pass: bool = True,
    checkpoint_requested: bool = False,
    preexisting_acceptance_verified: bool = False,
) -> dict:
    """Separate verified task completion from optional version-control closure."""
    task_completion_evidence = {
        "implementation_complete": implementation_complete or preexisting_acceptance_verified,
        "task_owned_tests_pass": task_owned_tests_pass,
        "build_pass": build_pass,
        "diff_check_pass": diff_check_pass,
        "visible_artifact_pass": visible_artifact_pass,
        "scope_verification_pass": scope_verification_pass,
        "preexisting_acceptance_verified": preexisting_acceptance_verified,
    }
    required = {key: value for key, value in task_completion_evidence.items() if key != "preexisting_acceptance_verified"}
    missing = [name for name, passed in required.items() if not passed]
    checkpoint_status = (
        "NOT_REQUESTED" if not checkpoint_requested
        else "CREATED" if checkpoint_exists and task_owned_files_clean
        else "PENDING"
    )
    version_control_evidence = {
        "checkpoint_requested": checkpoint_requested,
        "checkpoint_exists": checkpoint_exists,
        "task_owned_files_clean": task_owned_files_clean,
        "checkpoint_status": checkpoint_status,
    }
    return {
        **task_completion_evidence,
        **version_control_evidence,
        "task_completion_evidence": task_completion_evidence,
        "version_control_evidence": version_control_evidence,
        "verification_complete": not missing,
        "missing_evidence": missing,
    }


def command_evidence_passed(item: dict | None, *, required: bool) -> bool:
    """A required command passes only when a real command ran and returned PASS."""
    if not required:
        return True
    item = dict(item or {})
    return item.get("status") == "PASS" and bool((item.get("evidence") or {}).get("command"))


def visible_verification_authorized(gate: dict | None, contract: dict | None) -> bool:
    """Final reconcile must validate evidence source authority, not only a projected PASS label."""
    visible = dict((contract or {}).get("visible_artifact_contract") or {})
    if not visible.get("required"):
        return True
    gate = dict(gate or {})
    if gate.get("status") != "PASS" or gate.get("completion_allowed") is not True:
        return False
    from app.founder_ai.verification_fallback import verification_source_authorized
    requirements = dict(visible.get("verification_requirements") or {
        "artifact_required": True, "real_browser_required": True,
        "interaction_required": True, "component_static_allowed": False,
    })
    return verification_source_authorized(
        {"status": "VERIFIED", "evidence": list(gate.get("evidence") or [])}, requirements,
    )


def production_implementation_evidence_passed(
    *, result: dict, executor_passed: bool, scope_passed: bool, implementation_required: bool,
) -> bool:
    """Recheck implementation truth at final reconcile instead of trusting projected state."""
    if not implementation_required:
        return True
    return bool(
        executor_passed
        and scope_passed
        and result.get("task_owned_patch_persisted")
        and list(result.get("production_changed_files") or [])
    )


def refresh_completed_execution_artifacts(*, execution_id: str, repo_root: Path = REPO_ROOT) -> bool:
    """Recover browser/checkpoint callbacks from durable task-owned evidence."""
    record = get_execution_session(execution_id)
    if record is None:
        raise LookupError("Standard execution session not found")
    session, package = record
    if session.status != "completed":
        return False
    changed = set((session.result or {}).get("changed_files") or [])
    contract = dict((package.context or {}).get("standard_task_contract") or {})
    updated = False
    if contract.get("visible_artifact_contract", {}).get("required"):
        evidence_path = repo_root / ".founder-execution" / f"visible-artifact-{contract.get('task_id')}.json"
        if evidence_path.is_file() and dict((session.result or {}).get("browser_verification") or {}).get("status") != "PASS":
            import json
            try:
                evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                evidence = None
            if isinstance(evidence, dict) and evidence.get("status") == "PASS":
                session.result = {**dict(session.result or {}), "browser_verification": evidence}
                updated = True
    if not session.commit_hash and changed:
        head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=repo_root, capture_output=True, text=True).stdout.strip()
        committed = set(subprocess.run(
            ["git", "show", "--pretty=", "--name-only", "HEAD"], cwd=repo_root, capture_output=True, text=True,
        ).stdout.splitlines())
        if head and changed.issubset(committed):
            session.commit_hash = head
            updated = True
    if updated:
        append_event(session, "evidence_reconciled", status="completed", message="Missing verification callbacks reconciled from durable task evidence")
        save_execution_session(session, package)
    return updated


def resume_visible_artifact_verification(
    *, conversation_id: str, task_id: str, execution_id: str, repo_root: Path = REPO_ROOT,
) -> dict:
    """Resume only the missing real-browser stage after a contract-mapping gap.

    This transition is deliberately ineligible unless the same execution already
    owns a production patch and has durable PASS evidence for scope, tests, build,
    and diff. It never creates an execution or reruns implementation commands.
    """
    record = get_execution_session(execution_id)
    if record is None:
        raise LookupError("Standard execution session not found")
    session, package = record
    if session.task_asset_id != task_id:
        raise ValueError("task_execution_identity_mismatch")
    expected_reason = "UI implementation requires a visible artifact contract and browser evidence"
    if session.status not in {"failed", "blocked"} or session.failure_reason != expected_reason:
        return {"status": "NOT_APPLICABLE", "reason": "execution is not blocked by the visible-artifact contract gap"}
    result = dict(session.result or {})
    command_evidence = {item.get("verifier"): item for item in result.get("command_verification_evidence") or []}
    scope_pass = dict(result.get("scope_verification") or {}).get("status") == "PASS"
    commands_pass = all(
        command_evidence_passed(command_evidence.get(name), required=True)
        for name in ("targeted_tests", "build", "git_diff_check")
    )
    implementation_pass = bool(
        scope_pass and commands_pass and result.get("task_owned_patch_persisted")
        and list(result.get("production_changed_files") or [])
    )
    if not implementation_pass:
        return {"status": "REJECTED", "reason": "required durable pre-browser evidence is incomplete"}
    contract = build_standard_task_contract(
        conversation_id=conversation_id, goal=package.goal, task_id=task_id,
    )
    visible = dict(contract.get("visible_artifact_contract") or {})
    if not visible.get("required"):
        return {"status": "REJECTED", "reason": "visible artifact contract still unresolved"}
    package = replace(
        package,
        context={**dict(package.context), "standard_task_contract": contract},
    )
    from app.founder_ai.verification_fallback import PASS, system_chrome_playwright_verifier
    append_event(session, "browser_verification_started", status="verifying",
                 message="Visible artifact verification resumed on the same execution.",
                 metadata={"artifact_type": visible.get("artifact_type")})
    append_event(session, "fallback_browser_started", status="verifying",
                 message="System Chrome + Playwright fallback started",
                 metadata={"verifier": "system_chrome_playwright"})
    browser = system_chrome_playwright_verifier(repo_root=repo_root, contract=visible)
    event_name = "fallback_browser_passed" if browser.get("status") == PASS else (
        "fallback_browser_unavailable" if browser.get("status") in {"UNAVAILABLE", "TIMEOUT"}
        else "fallback_browser_failed"
    )
    append_event(session, event_name, status=str(browser.get("status") or "unknown").lower(),
                 message=f"system_chrome_playwright verification: {browser.get('status')}",
                 metadata={"verification_evidence": browser})
    if browser.get("status") != PASS:
        session.failure_reason = browser.get("failure_reason") or "visible artifact verification did not pass"
        save_execution_session(session, package)
        return {"status": "BLOCKED" if browser.get("status") in {"UNAVAILABLE", "TIMEOUT"} else "FAILED",
                "browser_verification": browser}
    browser_gate = {"status": "PASS", "evidence": [browser]}
    session.result = {
        **result,
        "browser_verification": browser_gate,
        "verification_evidence": [browser],
        "verification_outcome": "VERIFIED",
    }
    append_event(session, "verification_completed", status="verified",
                 message="Post-implementation browser verification completed on the same execution.",
                 metadata={"browser_verification": browser_gate})
    session.status = "completed"
    session.subprocess_exit_status = 0
    session.error_message = None
    session.failure_reason = None
    session.recoverable = False
    session.completed_at = _now()
    save_execution_session(session, package)
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is not None:
            discovery = dict(state.discovery or {})
            route = dict(discovery.get("task_complexity_route") or {})
            route["standard_task_contract"] = contract
            discovery["standard_task_contract"] = contract
            discovery["task_complexity_route"] = route
            state.discovery = discovery
            db.commit()
    return {"status": "VERIFIED", "browser_verification": browser_gate, "contract": visible}


def _command_result(result: dict, verifier: str) -> str | None:
    item = next((row for row in result.get("command_verification_evidence") or [] if row.get("verifier") == verifier), None)
    return str((item or {}).get("status")) if item else None


def _finalize_execution_playbook(
    *, task_id: str, execution_id: str, contract: dict, result: dict,
    task_status: str, execution_status: str, canonical_stage: str, progress: int,
    verification_result: str,
) -> dict:
    from app.founder_ai.playbook_composer import finalize_playbook_evidence
    browser = dict(result.get("browser_verification") or {})
    return finalize_playbook_evidence(
        task_id=task_id, execution_id=execution_id,
        playbook_context=dict(contract.get("playbook_context") or {}),
        final_result=execution_status, verification_result=verification_result,
        final_task_status=task_status, final_execution_status=execution_status,
        final_canonical_stage=canonical_stage, final_progress=progress,
        browser_verification_result=browser.get("status"),
        scope_result=dict(result.get("scope_verification") or {}).get("status"),
        tests_result=_command_result(result, "targeted_tests"),
        build_result=_command_result(result, "build"),
        diff_result=_command_result(result, "git_diff_check"),
    )


def reconcile_playbook_evidence_from_execution(*, task_id: str, execution_id: str) -> dict:
    """Evidence-only finalization for an already terminal canonical execution."""
    record = get_execution_session(execution_id)
    if record is None:
        raise LookupError("Standard execution session not found")
    session, package = record
    if session.task_asset_id != task_id:
        raise ValueError("task_execution_identity_mismatch")
    if sum(item.task_asset_id == task_id for item in list_execution_sessions()) != 1:
        return {"status": "REJECTED", "reason": "single canonical execution invariant failed"}
    with SessionLocal() as db:
        task = db.get(TaskAssetDB, task_id)
        task_status = str(task.status) if task else "not_found"
        task_execution_status = str(task.execution_status) if task else "not_found"
    result = dict(session.result or {})
    commands_pass = all(
        command_evidence_passed(next((row for row in result.get("command_verification_evidence") or [] if row.get("verifier") == name), None), required=True)
        for name in ("targeted_tests", "build", "git_diff_check")
    )
    completed_event = any(event.get("event_name") == "completed" and event.get("status") == "completed" for event in session.events)
    eligible = bool(
        task_status == "completed" and task_execution_status == "completed"
        and session.status == "completed" and session.execution_stage == "COMPLETED"
        and completed_event and commands_pass
        and dict(result.get("scope_verification") or {}).get("status") == "PASS"
        and dict(result.get("browser_verification") or {}).get("status") == "PASS"
    )
    if not eligible:
        return {"status": "REJECTED", "reason": "canonical completion evidence is incomplete"}
    contract = dict((package.context or {}).get("standard_task_contract") or {})
    return _finalize_execution_playbook(
        task_id=task_id, execution_id=execution_id, contract=contract, result=result,
        task_status="completed", execution_status="completed", canonical_stage="COMPLETED",
        progress=100, verification_result="PASS",
    )


def reconcile_standard_task_execution(*, conversation_id: str, task_id: str, execution_id: str, repo_root: Path = REPO_ROOT) -> dict:
    session, package = get_execution_session(execution_id) or (None, None)
    if session is None: raise LookupError("Standard execution session not found")
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
        route = dict((state.discovery or {}).get("task_complexity_route") or {}) if state else {}
    if route.get("classification") != "STANDARD_TASK" or (route.get("autonomous_execution") or {}).get("execution_session_id") != execution_id:
        return route
    durable_scope = dict((session.result or {}).get("scope_verification") or {})
    projected_scope = dict((route.get("autonomous_execution") or {}).get("scope_verification") or {})
    if durable_scope.get("status") == "PASS" and projected_scope.get("status") != "PASS":
        with SessionLocal() as db:
            state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
            discovery = dict(state.discovery or {}); current_route = dict(discovery.get("task_complexity_route") or {})
            autonomous = dict(current_route.get("autonomous_execution") or {}); autonomous["scope_verification"] = durable_scope
            current_route["autonomous_execution"] = autonomous; discovery["task_complexity_route"] = current_route
            state.discovery = discovery; db.commit()
        route["autonomous_execution"] = {**dict(route.get("autonomous_execution") or {}), "scope_verification": durable_scope}
    if session.status == "blocked" and package is not None:
        previous_scope = dict((session.result or {}).get("scope_verification") or {})
        recoverable_scope_block = (
            previous_scope.get("status") == "SCOPE_MISMATCH"
            and str(session.failure_reason or "").startswith((
                "scope mismatch after execution-owned commit",
                "scope mismatch after correction-owned commit",
            ))
        )
        if recoverable_scope_block:
            from app.founder_ai.execution_scope import SCOPE_PASS, verify_execution_scope
            contract = build_standard_task_contract(
                conversation_id=conversation_id, goal=package.goal, task_id=task_id,
            )
            changed_files = list(previous_scope.get("actual_changed_files") or [])
            head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=repo_root, capture_output=True, text=True).stdout.strip()
            committed_files = set(subprocess.run(
                ["git", "show", "--pretty=", "--name-only", head], cwd=repo_root, capture_output=True, text=True,
            ).stdout.splitlines()) if head else set()
            patch = subprocess.run(
                ["git", "show", "--format=", "--no-ext-diff", head, "--", *changed_files],
                cwd=repo_root, capture_output=True, text=True,
            ).stdout if head and changed_files else ""
            attribution = {
                "task_changed_files": changed_files,
                "execution_owned_patch": patch,
                "execution_owned_patch_fingerprint": previous_scope.get("patch_fingerprint"),
                "head_changed": True,
                "head_sha_after": head,
            }
            resolved_scope = verify_execution_scope(contract=contract, attribution=attribution)
            codex_event = next((event for event in reversed(session.events) if event.get("event_name") == "codex_finished"), None)
            codex_metadata = dict((codex_event or {}).get("metadata") or {})
            safe_commit = bool(head and changed_files and set(changed_files).issubset(committed_files))
            if resolved_scope["status"] == SCOPE_PASS and safe_commit and codex_metadata.get("exit_code") == 0:
                from app.founder_ai.post_implementation import run_post_implementation_pipeline
                verification = [*contract["acceptance_criteria"], "targeted frontend tests", "frontend build", "git diff --check"]
                package = replace(package, context={**dict(package.context), "standard_task_contract": contract}, verification=verification)
                def emit(event_name, status, message, metadata):
                    append_event(session, event_name, status=status, message=message, metadata=metadata)
                    save_execution_session(session, package)
                post_verification = run_post_implementation_pipeline(
                    package=package, attribution=attribution, repo_root=repo_root,
                    execution_id=execution_id, on_event=emit,
                )
                command_evidence = list(post_verification.get("evidence") or [])
                browser_checks = [item for item in command_evidence if item.get("verifier") in {
                    "preferred_browser", "system_chrome_playwright", "component_static_acceptance",
                }]
                session.result = {
                    **dict(session.result or {}),
                    "changed_files": changed_files,
                    "tests": verification,
                    "execution_attribution": attribution,
                    "scope_verification_before_reconcile": previous_scope,
                    "scope_verification": resolved_scope,
                    "task_owned_patch_persisted": True,
                    "command_verification_evidence": command_evidence,
                    "browser_verification": ({"status": "PASS", "evidence": browser_checks}
                                             if post_verification.get("status") == "VERIFIED" and browser_checks else {}),
                    "codex_run_id": codex_metadata.get("codex_run_id"),
                    "task_id": task_id,
                    "execution_id": execution_id,
                    "execution_package_id": session.execution_package_id,
                }
                if post_verification.get("status") != "VERIFIED":
                    session.status = "failed" if post_verification.get("status") == "FAILED" else "blocked"
                    session.failure_reason = post_verification.get("failure_reason") or f"post-implementation {post_verification.get('stage')} failed"
                    save_execution_session(session, package)
                    return _project(
                        conversation_id,
                        step="verification",
                        blocker={
                            "type": "standard_task_verification_failed",
                            "terminal_status": session.status.upper(),
                            "reason": session.failure_reason,
                            "verification_stage": post_verification.get("stage"),
                            "founder_gate_required": False,
                        },
                        execution={
                            "execution_session_id": execution_id,
                            "dispatch_status": session.status,
                            "scope_verification": resolved_scope,
                        },
                    )
                session.status = "completed"; session.subprocess_exit_status = 0; session.commit_hash = head
                session.error_message = None; session.failure_reason = None; session.recoverable = False
                session.completed_at = _now()
                append_event(session, "scope_reconciled", status="scope_passed",
                             message="Previously unresolved CSS task scope reconciled against its committed task-owned patch.",
                             metadata={"scope_before": previous_scope, "scope_after": resolved_scope, "commit_hash": head})
                save_execution_session(session, package)
                with SessionLocal() as db:
                    state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
                    discovery = dict(state.discovery or {}); current_route = dict(discovery.get("task_complexity_route") or {})
                    current_route["standard_task_contract"] = contract; discovery["standard_task_contract"] = contract
                    autonomous = dict(current_route.get("autonomous_execution") or {})
                    autonomous["scope_verification"] = resolved_scope
                    current_route["autonomous_execution"] = autonomous
                    discovery["task_complexity_route"] = current_route; state.discovery = discovery; db.commit()
                route["standard_task_contract"] = contract
                route["autonomous_execution"] = {
                    **dict(route.get("autonomous_execution") or {}), "scope_verification": resolved_scope,
                }
    if session.status != "completed":
        terminal_contract = dict((package.context or {}).get("standard_task_contract") or {}) if package else {}
        if session.status in {"failed", "blocked", "cancelled"}:
            _finalize_execution_playbook(
                task_id=task_id, execution_id=execution_id, contract=terminal_contract,
                result=dict(session.result or {}), task_status="in_progress",
                execution_status=session.status, canonical_stage=session.execution_stage,
                progress=100, verification_result="not_completed" if session.status == "cancelled" else session.status,
            )
        if session.status == "blocked" and (session.result or {}).get("scope_verification"):
            return project_scope_mismatch(conversation_id=conversation_id, execution_id=execution_id, evidence=session.result or {})
        return _project(conversation_id, step="execution", blocker={"type": "standard_task_execution_failed", "reason": session.failure_reason, "founder_gate_required": False}, execution={"dispatch_status": session.status})
    from app.founder_ai.technical_resolution import is_local_health_check_goal, resolve_local_health_check
    if package and is_local_health_check_goal(package.goal):
        resolution = dict(session.technical_resolution or {})
        if resolution.get("resolution_status") != "resolved":
            resolve_local_health_check(conversation_id=conversation_id, task_id=task_id, execution_id=execution_id, repo_root=repo_root)
        with SessionLocal() as db:
            state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
            return dict((state.discovery or {}).get("task_complexity_route") or {})
    diff_ok = subprocess.run(["git", "diff", "--check"], cwd=repo_root, capture_output=True, text=True).returncode == 0
    status_lines = subprocess.run(["git", "status", "--porcelain=v1"], cwd=repo_root, capture_output=True, text=True).stdout.splitlines()
    dirty_paths = {line[3:] for line in status_lines if len(line) > 3}
    task_owned_paths = set((session.result or {}).get("changed_files") or [])
    task_owned_dirty = sorted(dirty_paths & task_owned_paths)
    unrelated_dirty = sorted(dirty_paths - task_owned_paths)
    clean = not task_owned_dirty
    contract = dict(route.get("standard_task_contract") or {})
    source_goal = str(contract.get("source_goal") or "")
    verification_only = source_goal.strip().startswith("验证") or any(marker in source_goal for marker in ("不修改任何代码", "只读", "仅验证", "回归验证"))
    required_verification = list((session.result or {}).get("tests") or [])
    executor_passed = session.subprocess_exit_status == 0
    command_evidence = {item.get("verifier"): item for item in (session.result or {}).get("command_verification_evidence") or []}
    tests_required = any("test" in item.lower() for item in required_verification)
    build_required = any("build" in item.lower() for item in required_verification)
    browser_evidence = dict((session.result or {}).get("browser_verification") or {})
    visible_gate = ({
        "status": "PASS", "completion_allowed": True,
        "evidence": list(browser_evidence.get("evidence") or [browser_evidence]),
        "failure_reason": None,
    } if browser_evidence.get("status") == "PASS" else None)
    if contract.get("visible_artifact_contract", {}).get("required"):
        from app.founder_ai.verification_fallback import (
            PASS, UNAVAILABLE, evidence, execute_ui_verification_chain, system_chrome_playwright_verifier,
            verification_source_authorized,
        )
        visible_contract = dict(contract.get("visible_artifact_contract") or {})
        requirements = dict(visible_contract.get("verification_requirements") or {})
        post_verification = dict((session.result or {}).get("post_implementation_verification") or {})
        post_attempts = [item for item in post_verification.get("evidence") or [] if item.get("verifier") in {
            "preferred_browser", "system_chrome_playwright", "component_static_acceptance",
        }]
        post_chain = {"status": post_verification.get("status"), "evidence": post_attempts}
        if post_verification.get("status") == "VERIFIED" and verification_source_authorized(post_chain, requirements):
            visible_gate = {
                "status": "PASS", "completion_allowed": True, "authority_satisfied": True,
                "verification_source": post_verification.get("verification_source"),
                "verification_requirements": requirements, "evidence": post_attempts,
                "verification_attempt": post_verification.get("verification_attempt"),
                "failure_reason": None,
            }

        def system_browser():
            return system_chrome_playwright_verifier(repo_root=repo_root, contract=visible_contract)

        def static_acceptance():
            owned_tests = [path for path in contract.get("implementation_scope") or [] if ".test." in path or path.endswith("_test.py")]
            if command_evidence.get("targeted_tests", {}).get("status") == "PASS" and owned_tests:
                return evidence("component_static_acceptance", PASS, detail={"task_owned_component_tests": owned_tests})
            return evidence("component_static_acceptance", UNAVAILABLE, failure_reason="no passing task-owned component acceptance test")

        if visible_gate is None:
            chain = execute_ui_verification_chain(
                preferred=browser_evidence, system_browser=system_browser, static_acceptance=static_acceptance,
                requirements=requirements, timeout_seconds=45,
            )
            visible_gate = {
                "status": "PASS" if chain["status"] == "VERIFIED" else chain["status"],
                "completion_allowed": chain["status"] == "VERIFIED" and chain.get("authority_satisfied") is not False,
                "authority_satisfied": chain.get("authority_satisfied", False),
                "verification_source": chain.get("verification_source"),
                "verification_requirements": requirements,
                "evidence": chain["evidence"], "failure_reason": chain.get("failure_reason"),
            }
            session.result = {**dict(session.result or {}), "verification_evidence": chain["evidence"], "verification_outcome": chain["status"]}
            save_execution_session(session, package)
    checkpoint_requirement = str(package.commit_requirement if package else "").strip().lower()
    checkpoint_requested = bool(checkpoint_requirement and checkpoint_requirement not in {"none", "not requested", "not_required"})
    result_data = dict(session.result or {})
    production_files = list(result_data.get("production_changed_files") or [])
    implementation_required = bool(contract.get("implementation_required", not verification_only))
    preexisting_acceptance_verified = bool(result_data.get("preexisting_acceptance_verified"))
    tests_evidence = dict(command_evidence.get("targeted_tests") or {})
    build_evidence = dict(command_evidence.get("build") or {})
    visible_required = bool((contract.get("visible_artifact_contract") or {}).get("required")) or any(
        path.startswith("frontend/") for path in production_files
    )
    implementation_evidence_passed = production_implementation_evidence_passed(
        result=result_data, executor_passed=executor_passed,
        scope_passed=durable_scope.get("status") == "PASS",
        implementation_required=implementation_required,
    )
    closure_evidence = evaluate_standard_verification_evidence(
        implementation_complete=session.status == "completed" and implementation_evidence_passed,
        task_owned_tests_pass=executor_passed and command_evidence_passed(tests_evidence, required=tests_required),
        build_pass=executor_passed and command_evidence_passed(build_evidence, required=build_required),
        visible_artifact_pass=not visible_required or visible_verification_authorized(visible_gate, contract),
        checkpoint_exists=(bool(session.commit_hash) and not task_owned_dirty) or not task_owned_paths or (verification_only and not task_owned_dirty),
        task_owned_files_clean=clean and diff_ok,
        scope_verification_pass=dict((session.result or {}).get("scope_verification") or {}).get("status") == "PASS",
        diff_check_pass=diff_ok,
        checkpoint_requested=checkpoint_requested,
        preexisting_acceptance_verified=preexisting_acceptance_verified,
    )
    passed = closure_evidence["verification_complete"]
    verification = {"status": "PASS" if passed else "FAIL", "targeted_tests": command_evidence.get("targeted_tests"), "build": command_evidence.get("build"), "git_diff_check": "PASS" if diff_ok else "FAIL", "checkpoint": closure_evidence["checkpoint_status"],
                    "working_tree": "task_owned_clean" if clean else "task_owned_dirty", "task_owned_dirty": task_owned_dirty,
                    "unrelated_dirty_preserved": unrelated_dirty, "browser_verification": visible_gate,
                    "task_completion_evidence": closure_evidence["task_completion_evidence"],
                    "version_control_evidence": closure_evidence["version_control_evidence"],
                    "closure_evidence": closure_evidence}
    if verification["status"] != "PASS":
        outcome = str((visible_gate or {}).get("status") or "BLOCKED")
        failed = outcome == "FAILED"
        _finalize_execution_playbook(
            task_id=task_id, execution_id=execution_id, contract=contract,
            result=dict(session.result or {}), task_status="in_progress",
            execution_status="failed" if failed else "blocked",
            canonical_stage="FAILED" if failed else "BLOCKED", progress=100,
            verification_result="failed" if failed else "blocked",
        )
        return _project(conversation_id, step="verification", blocker={
            "type": "standard_task_acceptance_failed" if failed else "standard_task_verification_blocked",
            "terminal_status": "FAILED" if failed else "BLOCKED", "evidence": verification,
            "reason": (visible_gate or {}).get("failure_reason"), "founder_gate_required": False,
        }, execution={"dispatch_status": "failed" if failed else "blocked", "verification": verification})
    learning = {"status": "recorded", "type": "STANDARD_TASK_IMPLEMENTATION",
                "rule": f"Keep implementation and verification bounded to {contract.get('target_surface') or 'the confirmed target surface'}."}
    closure = {"closure_status": "awaiting_founder_acceptance", "task_closed": False, "completed_at": _now()}
    visible_result = None
    if visible_gate:
        visible_result = {"title": contract.get("objective") or "Visible UI task result", "target_surface": contract.get("target_surface"),
                          "target_route": contract.get("target_route"), "verification_status": "PASS", "verified_at": _now(),
                          "browser_verification": visible_gate}
        with SessionLocal() as db:
            state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
            discovery = dict(state.discovery or {}); current_route = dict(discovery.get("task_complexity_route") or {})
            current_route["visible_artifact_verification"] = visible_gate; current_route["visible_result"] = visible_result
            discovery["task_complexity_route"] = current_route; state.discovery = discovery; db.commit()
    result = {"status": "completed", "verification": verification, "checkpoint_commit": session.commit_hash, "learning": learning, "closure": closure, "visible_result": visible_result}
    with SessionLocal() as db:
        task = db.get(TaskAssetDB, task_id); task.status = "completed"; task.execution_status = "completed"; task.result = result; db.commit()
    if session.current_stage != "completed":
        append_event(
            session,
            "completed",
            status="completed",
            message="Task execution completed with all required verification evidence.",
            metadata={"verification_status": verification["status"]},
        )
        save_execution_session(session, package)
    _finalize_execution_playbook(
        task_id=task_id, execution_id=execution_id, contract=contract,
        result=dict(session.result or {}), task_status="completed",
        execution_status="completed", canonical_stage="COMPLETED", progress=100,
        verification_result="PASS",
    )
    return _project(conversation_id, step="complete", execution={"dispatch_status": "completed", "verification": verification, "learning": learning, "closure": closure, "result": result})
