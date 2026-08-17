"""Compile approved natural-language work items into evidence-bound machine actions."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json


ACTION_VOCABULARY = {"READ_ONLY_VALIDATE", "VERIFY_CONFIGURATION", "VERIFY_CONNECTIVITY", "VERIFY_CAPABILITY", "BIND_EXISTING_RESOURCE", "APPLY_LOCAL_CONFIGURATION"}
SIDE_EFFECT_CLASSES = {"READ_ONLY", "LOCAL_REPOSITORY_SIDE_EFFECT", "LOCAL_RUNTIME_SIDE_EFFECT", "EXTERNAL_SERVICE_SIDE_EFFECT", "CLOUD_INFRASTRUCTURE_SIDE_EFFECT", "PRODUCTION_SIDE_EFFECT"}


def _action(*, work_item: dict, capability: str, operation_type: str, target_type: str, target, target_source: str, evidence_refs: list[str], verification: dict, status: str, blocker: str | None = None) -> dict:
    action_id = f"action-{work_item.get('work_item_id')}-{hashlib.sha256(f'{operation_type}:{target_source}'.encode()).hexdigest()[:10]}"
    return {
        "action_id": action_id, "work_item_id": work_item.get("work_item_id"), "capability": capability,
        "operation_type": operation_type, "target_type": target_type, "target": target,
        "target_source": target_source, "evidence_refs": evidence_refs, "inputs": {},
        "preconditions": ["source Package identity unchanged", "Frozen Scope fingerprint unchanged", "target evidence remains observable"],
        "allowed_effect": "Read-only observation of the evidence-bound target.", "side_effect_class": ["READ_ONLY"],
        "verification": verification,
        "rollback": {"rollback_anchor": "no mutation", "rollback_action": "none", "rollback_scope": "none", "rollback_verification": "working tree and target state unchanged"},
        "stop_conditions": ["target evidence missing", "credential content required", "write operation required", "verification observable unavailable"],
        "founder_gate_reentry_conditions": ["new credential", "incremental cost", "external write", "cloud infrastructure write", "production impact", "architecture boundary change"],
        "action_status": status, "blocker": blocker,
    }


def compile_action_contract(*, package: dict, proposal: dict, source_handoff_id: str, source_session_id: str, source_scope_fingerprint: str) -> dict:
    content = dict(proposal.get("content") or {})
    discovery = dict(content.get("environment_discovery") or {})
    candidates = {item.get("logical_dependency"): dict(item) for item in discovery.get("candidate_infrastructure") or []}
    work_items = [dict(item) for item in package.get("work_items") or []]
    by_capability = {}
    for item in work_items:
        text = " ".join(str(item.get(key) or "") for key in ("title", "purpose", "scope")).casefold()
        capability = next((name for name in ("storage", "compute", "iam", "network") if name in text), None)
        if capability and capability not in by_capability:
            by_capability[capability] = item
        elif not capability:
            by_capability["overall_runtime_validation"] = item
    actions = []
    storage = candidates.get("storage")
    compute = candidates.get("compute")
    if "storage" in by_capability:
        actions.append(_action(
            work_item=by_capability["storage"], capability="storage", operation_type="VERIFY_CONNECTIVITY", target_type="observed_database",
            target={"target_id": "observed-runtime/storage/current-postgresql-development-database", "display_name": storage.get("candidate") if storage else None} if storage else None,
            target_source="environment_discovery.candidate_infrastructure[storage]", evidence_refs=["founder_gate_proposal.environment_discovery.storage", "runtime_binding.resource_bindings.storage"],
            verification={"observe": "connection_attempt.succeeded", "pass": "value == true", "fail": "value == false", "blocked": "credential reference unavailable without reading secret content"},
            status="executable" if storage and storage.get("availability") == "ACTIVE" else "ACTION_BLOCKED_MISSING_EVIDENCE", blocker=None if storage else "No observed storage target."))
    if "compute" in by_capability:
        actions.append(_action(
            work_item=by_capability["compute"], capability="compute", operation_type="VERIFY_CAPABILITY", target_type="observed_application_process",
            target={"target_id": "observed-runtime/compute/current-development-application-process", "display_name": compute.get("candidate") if compute else None} if compute else None,
            target_source="environment_discovery.candidate_infrastructure[compute]", evidence_refs=["founder_gate_proposal.environment_discovery.compute", "runtime_binding.resource_bindings.compute"],
            verification={"observe": ["process_health.running", "basic_compute_probe.exit_code"], "pass": "running == true AND exit_code == 0", "fail": "running == false OR exit_code != 0", "blocked": "health or compute probe unavailable"},
            status="executable" if compute and compute.get("availability") == "ACTIVE" else "ACTION_BLOCKED_MISSING_EVIDENCE", blocker=None if compute else "No observed compute target."))
    for capability in ("iam", "network"):
        if capability in by_capability:
            actions.append(_action(
                work_item=by_capability[capability], capability=capability, operation_type="VERIFY_CONFIGURATION", target_type=f"observed_{capability}_configuration",
                target=None, target_source=f"architecture_candidate.{capability}_strategy", evidence_refs=[f"founder_gate_proposal.resolution_evidence.resource:{capability}"],
                verification={"observe": f"{capability}_configuration.exists", "pass": "value == true", "fail": "value == false", "blocked": "no observed configuration target"},
                status="ACTION_BLOCKED_MISSING_EVIDENCE", blocker=f"{capability.upper()} is a DESIGNABLE architecture boundary, but no observed configured target exists. Creating one would require APPLY_LOCAL_CONFIGURATION outside the current repository-path contract."))
    if "overall_runtime_validation" in by_capability:
        actions.append(_action(
            work_item=by_capability["overall_runtime_validation"], capability="overall_runtime_validation", operation_type="READ_ONLY_VALIDATE", target_type="dependency_validation",
            target={"target_id": "dependency-check/intelligence-evolution-layer/wi-007", "required_signals": ["storage", "compute", "iam", "network"]},
            target_source="execution_package.validation_plan.final_acceptance", evidence_refs=["execution_package.validation_plan", "dependency_evidence.intelligence_evolution_layer.wi-007"],
            verification={"observe": ["dependency.storage", "dependency.compute", "dependency.iam", "dependency.network", "iel.wi-007.resumable"], "pass": "all dependencies == true AND resumable == true", "fail": "any dependency == false", "blocked": "any prerequisite action is not PASS"},
            status="ACTION_BLOCKED_DEPENDENCY", blocker="Depends on WI-001 through WI-004; IAM and network actions currently lack observed targets."))

    allowed_work_ids = {item.get("work_item_id") for item in work_items}
    allowed_capabilities = set(((package.get("execution_readiness_contract") or {}).get("execution_scope") or {}).get("included_capabilities") or [])
    scope_checks = {
        "work_items_subset": all(item["work_item_id"] in allowed_work_ids for item in actions),
        "capabilities_subset": all(item["capability"] in allowed_capabilities for item in actions),
        "operation_vocabulary": all(item["operation_type"] in ACTION_VOCABULARY for item in actions),
        "side_effect_vocabulary": all(set(item["side_effect_class"]).issubset(SIDE_EFFECT_CLASSES) for item in actions),
        "frozen_scope_fingerprint_preserved": source_scope_fingerprint == ((package.get("executor_handoff") or {}).get("scope_fingerprint")),
    }
    blocked = [item for item in actions if item["action_status"].startswith("ACTION_BLOCKED")]
    founder_gate = [item for item in actions if item["action_status"] == "founder_gate_required"]
    status = "action_founder_gate_required" if founder_gate else "action_compilation_blocked" if blocked or not all(scope_checks.values()) else "action_compilation_ready"
    fingerprint_payload = {"package_id": package.get("package_id"), "source_scope_fingerprint": source_scope_fingerprint, "actions": actions, "scope_validation": scope_checks}
    fingerprint = hashlib.sha256(json.dumps(fingerprint_payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    seed = f"{package.get('package_id')}:{source_handoff_id}:{source_session_id}:1"
    return {
        "action_contract_id": f"machine-action-contract-{hashlib.sha256(seed.encode()).hexdigest()[:20]}",
        "package_id": package.get("package_id"), "source_readiness_contract_id": (package.get("execution_readiness_contract") or {}).get("contract_id"),
        "source_handoff_id": source_handoff_id, "source_blocked_session_id": source_session_id, "source_scope_fingerprint": source_scope_fingerprint,
        "contract_version": 1, "compilation_status": status, "actions": actions,
        "executable_action_count": sum(item["action_status"] == "executable" for item in actions), "blocked_action_count": len(blocked), "founder_gate_action_count": len(founder_gate),
        "evidence_validation": {"observed_targets": sorted(candidates), "all_executable_targets_evidence_bound": all(item.get("target") and item.get("evidence_refs") for item in actions if item["action_status"] == "executable")},
        "scope_validation": {"status": "passed" if all(scope_checks.values()) else "failed", "checks": scope_checks},
        "action_contract_fingerprint": fingerprint, "founder_decision_required": bool(founder_gate),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
