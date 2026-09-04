from pathlib import Path

from app.founder_ai.action_contract import compile_action_contract
from app.founder_ai.evidence_resolution import discover_iam_network_evidence


def test_discovers_non_secret_iam_and_loopback_network_metadata(tmp_path, monkeypatch):
    files = {
        "backend/app/core/intelligence_evolution/auth.py": 'HTTPBearer\ndef require_roles():\n claims.get("roles")',
        "backend/app/core/intelligence_evolution/api.py": "Depends(require_roles",
        "scripts/backend-server": "--host 127.0.0.1 --port 8000",
        "scripts/frontend-server": "--host 127.0.0.1 --port 5173",
        "scripts/runtime-common.sh": "http://127.0.0.1:8000/health http://127.0.0.1:5173/",
    }
    for name, content in files.items():
        target = tmp_path / name; target.parent.mkdir(parents=True, exist_ok=True); target.write_text(content)
    monkeypatch.setattr("app.founder_ai.evidence_resolution._listener_observed", lambda _port: True)
    result = discover_iam_network_evidence(tmp_path)
    assert result["resolution_status"] == "resolved"
    assert result["secrets_read"] is False
    assert result["external_writes"] is False
    assert result["production_impact"] == "none"
    assert result["iam"]["target"]["target_id"] == "application-identity/intelligence-evolution-http-bearer-rbac"
    assert result["network"]["target"]["bind_address_type"] == "loopback"
    assert result["iam"]["evidence"]["sensitive"] is False


def test_resolved_evidence_makes_iam_network_and_aggregate_validation_executable():
    work_items = [{"work_item_id": f"wi-{n}", "title": title} for n, title in enumerate(("storage", "compute", "IAM", "network", "overall storage compute IAM network validation"), 1)]
    package = {"package_id": "p", "work_items": work_items, "execution_readiness_contract": {"execution_scope": {"included_capabilities": ["storage", "compute", "iam", "network", "overall_runtime_validation"]}}, "executor_handoff": {"scope_fingerprint": "scope"}}
    proposal = {"content": {"environment_discovery": {"candidate_infrastructure": [{"logical_dependency": "storage", "candidate": "db", "availability": "ACTIVE"}, {"logical_dependency": "compute", "candidate": "process", "availability": "ACTIVE"}]}}}
    evidence = {name: {"observed": True, "target_type": f"{name}_configuration", "target": {"target_id": name}, "evidence": {"evidence_id": f"evidence-{name}", "sensitive": False}} for name in ("iam", "network")}
    result = compile_action_contract(package=package, proposal=proposal, source_handoff_id="h", source_session_id="s", source_scope_fingerprint="scope", contract_version=3, evidence_resolution=evidence)
    assert len(result["actions"]) == 5
    assert result["executable_action_count"] == 5
    assert result["blocked_action_count"] == 0
    assert result["compilation_status"] == "action_compilation_ready"
    assert result["founder_decision_required"] is False
