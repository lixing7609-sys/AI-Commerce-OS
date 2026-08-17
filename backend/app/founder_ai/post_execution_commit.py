"""Materialize immutable post-execution result, evidence, learning, and closure readiness."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json

from sqlalchemy import select

from app.core.artifact.model import ArtifactAssetDB
from app.core.memory.model import MemoryAssetDB
from app.founder_ai.execution_registry import list_actually_active_sessions


def _stable_id(prefix: str, seed: str) -> str:
    return f"{prefix}-{hashlib.sha256(seed.encode()).hexdigest()[:20]}"


def _learning(*, result_id: str, learning_type: str, statement: str, action_ids: list[str], evidence_refs: list[str], scope: str, reuse_conditions: list[str], invalidation_conditions: list[str]) -> dict:
    return {
        "learning_id": _stable_id("learning", f"{result_id}:{learning_type}:{statement}"), "learning_type": learning_type,
        "statement": statement, "source_result_id": result_id, "source_action_ids": action_ids, "evidence_refs": evidence_refs,
        "confidence": "high", "scope": scope, "reusable": True, "reuse_conditions": reuse_conditions,
        "invalidation_conditions": invalidation_conditions, "sensitive": False, "created_at": datetime.now(timezone.utc).isoformat(),
    }


def build_post_execution_records(*, package: dict, session, repository_head: str) -> dict:
    raw = dict(session.result or {})
    if session.status != "completed" or raw.get("verification_result") != "PASS" or raw.get("execution_status") != "completed":
        raise ValueError("completed_verified_session_required")
    action_results = [dict(item) for item in raw.get("action_results") or []]
    result_id = _stable_id("execution-result", session.id)
    result = {
        "result_id": result_id, "package_id": raw.get("package_id"), "handoff_id": raw.get("handoff_id"),
        "execution_session_id": session.id, "action_contract_id": raw.get("action_contract_id"),
        "action_contract_fingerprint": raw.get("action_contract_fingerprint"), "scope_fingerprint": raw.get("scope_fingerprint_v2"),
        "execution_goal": ((package.get("active_executor_handoff_v2") or {}).get("execution_goal")),
        "started_at": raw.get("started_at"), "completed_at": raw.get("completed_at"), "final_status": raw.get("execution_status"),
        "verification_status": raw.get("verification_result"), "action_results": action_results,
        "pass_count": raw.get("pass_count"), "fail_count": raw.get("fail_count"), "blocked_count": raw.get("blocked_count"),
        "side_effects": raw.get("side_effects"), "founder_gate_reentry": raw.get("founder_gate_reentry"),
        "working_tree_status": raw.get("working_tree_status"), "repository_head": repository_head,
        "evidence_refs": sorted({ref for item in action_results for ref in item.get("evidence_refs") or []}),
    }
    artifact_types = {
        "wi-cloud-001": ("RUNTIME_BINDING_EVIDENCE", "storage"), "wi-cloud-002": ("EXECUTION_EVIDENCE", "compute"),
        "wi-cloud-003": ("IAM_CONFIGURATION_EVIDENCE", "iam"), "wi-cloud-004": ("NETWORK_CONFIGURATION_EVIDENCE", "network"),
        "wi-cloud-005": ("VALIDATION_RESULT", "overall_runtime_validation"),
    }
    artifacts = []
    for action in action_results:
        artifact_type, capability = artifact_types[action["work_item_id"]]
        artifacts.append({
            "artifact_id": _stable_id("artifact", f"{result_id}:{action['action_id']}"), "artifact_type": artifact_type,
            "artifact_kind": "structured_record", "source_session_id": session.id, "source_action_id": action["action_id"],
            "capability": capability, "content_summary": f"{action['operation_type']} verified {action['target'].get('target_id')} with {action['verification_result']}.",
            "evidence_refs": action.get("evidence_refs") or [], "reproducibility": {"adapter_calls": action.get("commands_or_adapter_calls") or [], "verification_result": action.get("verification_result")},
            "sensitive": False, "reusable": True, "created_at": datetime.now(timezone.utc).isoformat(),
        })
    action_ids = {item["work_item_id"]: item["action_id"] for item in action_results}
    evidence = {item["work_item_id"]: item.get("evidence_refs") or [] for item in action_results}
    scope = "AI Commerce OS local development runtime bound by the source Action Contract fingerprint"
    learnings = [
        _learning(result_id=result_id, learning_type="VALIDATED_FACT", statement="The evidence-bound development database target can be checked with a read-only SELECT 1 connectivity probe.", action_ids=[action_ids["wi-cloud-001"]], evidence_refs=evidence["wi-cloud-001"], scope=scope, reuse_conditions=["database target is evidence-bound", "probe remains read-only"], invalidation_conditions=["database target changes", "credential reference becomes unavailable"]),
        _learning(result_id=result_id, learning_type="VALIDATED_FACT", statement="The development application process can be verified by its backend listener and read-only health probe.", action_ids=[action_ids["wi-cloud-002"]], evidence_refs=evidence["wi-cloud-002"], scope=scope, reuse_conditions=["development process target is unchanged"], invalidation_conditions=["listen port or health route changes"]),
        _learning(result_id=result_id, learning_type="VALIDATED_FACT", statement="The observed IAM target is application-level HTTP Bearer RBAC with role-claim protected routes.", action_ids=[action_ids["wi-cloud-003"]], evidence_refs=evidence["wi-cloud-003"], scope=scope, reuse_conditions=["application authorization architecture is unchanged"], invalidation_conditions=["auth mechanism or protected route configuration changes"]),
        _learning(result_id=result_id, learning_type="GUARDRAIL", statement="Credential validation is limited to reference and metadata existence; secret values must never be read or emitted.", action_ids=[action_ids["wi-cloud-001"], action_ids["wi-cloud-003"]], evidence_refs=evidence["wi-cloud-001"] + evidence["wi-cloud-003"], scope=scope, reuse_conditions=["verification does not require secret material"], invalidation_conditions=["operation requires secret value access"]),
        _learning(result_id=result_id, learning_type="VALIDATED_FACT", statement="The observed development network boundary is loopback: backend 127.0.0.1:8000 and frontend 127.0.0.1:5173.", action_ids=[action_ids["wi-cloud-004"]], evidence_refs=evidence["wi-cloud-004"], scope=scope, reuse_conditions=["development server bindings are unchanged"], invalidation_conditions=["bind address or ports change"]),
        _learning(result_id=result_id, learning_type="PROCEDURE", statement="Overall runtime validation runs only after storage, compute, IAM, and network verification all PASS.", action_ids=list(action_ids.values()), evidence_refs=result["evidence_refs"], scope=scope, reuse_conditions=["same dependency graph"], invalidation_conditions=["work-item dependency graph changes"]),
        _learning(result_id=result_id, learning_type="GUARDRAIL", statement="A machine action without an evidence-bound concrete target remains BLOCKED; the Executor must not infer a replacement.", action_ids=list(action_ids.values()), evidence_refs=result["evidence_refs"], scope="Machine Action Contract compilation and execution", reuse_conditions=["controlled execution mode"], invalidation_conditions=["a new approved action vocabulary explicitly changes the guard"]),
        _learning(result_id=result_id, learning_type="GUARDRAIL", statement="Action and scope fingerprints must match before Execution Start.", action_ids=list(action_ids.values()), evidence_refs=[raw.get("action_contract_fingerprint"), raw.get("scope_fingerprint_v2")], scope="Controlled Executor Handoff", reuse_conditions=["versioned handoff execution"], invalidation_conditions=["fingerprint scheme version changes"]),
        _learning(result_id=result_id, learning_type="REUSE_RULE", statement="READ_ONLY machine actions produce no repository, runtime mutation, external service, cloud infrastructure, or production write.", action_ids=list(action_ids.values()), evidence_refs=result["evidence_refs"], scope="Evidence-bound read-only validation", reuse_conditions=["all actions remain READ_ONLY"], invalidation_conditions=["any action side-effect class changes"]),
    ]
    proposal = dict(package.get("founder_gate_proposal") or {})
    decision_memory = {
        "memory_id": _stable_id("decision-memory", result_id), "source_proposal_id": proposal.get("proposal_id"),
        "links": ["Credential Authorization", "Cost Authorization", "External Side Effect Authorization", "Production Impact Authorization"],
        "validation": "Execution completed inside all four approved boundaries without re-entry.", "source_result_id": result_id,
    }
    reuse = {
        "reuse_candidate_id": _stable_id("reuse-candidate", result_id), "capability": "development-runtime-validation",
        "applicable_environment": "evidence-bound isolated development environments",
        "required_preconditions": ["approved runtime binding", "evidence-bound concrete targets", "READ_ONLY side-effect class", "matching action and scope fingerprints"],
        "machine_action_template_refs": [item["action_id"] for item in action_results],
        "evidence_requirements": ["database target metadata", "process health metadata", "application authorization metadata", "network boundary metadata"],
        "verification_template": "VERIFY_CONNECTIVITY / VERIFY_CAPABILITY / VERIFY_CONFIGURATION followed by dependency validation",
        "side_effect_boundary": "READ_ONLY; environment-specific bindings are inputs, not universal defaults",
        "founder_gate_conditions": ["new credential", "incremental cost", "external write", "cloud infrastructure write", "production impact", "architecture boundary change"],
        "confidence": "high", "source_result_id": result_id, "status": "candidate",
    }
    return {"result_record": result, "artifacts": artifacts, "learnings": learnings, "decision_memory": decision_memory, "reuse_candidate": reuse}


def persist_post_execution_records(session, *, records: dict, conversation_id: str) -> dict:
    for payload in records["artifacts"]:
        if session.get(ArtifactAssetDB, payload["artifact_id"]) is None:
            session.add(ArtifactAssetDB(id=payload["artifact_id"], system_id="founder_ai", conversation_id=conversation_id, artifact_type=payload["artifact_type"], title=f"{payload['capability']} validation evidence", description=json.dumps(payload, ensure_ascii=False), content_ref=f"execution-result://{records['result_record']['result_id']}/{payload['source_action_id']}", status="active"))
    for payload in records["learnings"]:
        if session.get(MemoryAssetDB, payload["learning_id"]) is None:
            session.add(MemoryAssetDB(id=payload["learning_id"], system_id="founder_ai", conversation_id=conversation_id, memory_type=payload["learning_type"], title=payload["statement"][:200], content=json.dumps(payload, ensure_ascii=False), summary=payload["statement"], confidence=1.0, status="active", source_message_ids=[]))
    session.flush()
    package_id = records["result_record"]["package_id"]
    active = list_actually_active_sessions(package_id=package_id)
    checks = {
        "execution_completed": records["result_record"]["final_status"] == "completed", "verification_pass": records["result_record"]["verification_status"] == "PASS",
        "result_record_exists": bool(records["result_record"].get("result_id")), "artifacts_recorded": len(records["artifacts"]) > 0,
        "learning_recorded": len(records["learnings"]) > 0, "decision_memory_linked": len(records["decision_memory"]["links"]) == 4,
        "reuse_candidate_evaluated": bool(records["reuse_candidate"].get("reuse_candidate_id")),
        "working_tree_clean": records["result_record"].get("working_tree_status") == "clean", "no_unresolved_blocker": records["result_record"].get("blocked_count") == 0,
        "no_pending_founder_gate": records["result_record"].get("founder_gate_reentry") is False, "no_active_execution_session": not active,
    }
    return {"closure_status": "closure_ready" if all(checks.values()) else "closure_blocked", "checks": checks, "task_closed": False, "active_session_ids": [item.id for item in active]}
