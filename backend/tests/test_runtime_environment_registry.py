from datetime import datetime, timedelta, timezone

from app.core.runtime_environment import service


def verified_package():
    actions = [{"work_item_id": f"wi-cloud-00{i}", "action_id": f"action-{i}", "verification_result": "PASS"} for i in range(1, 6)]
    return {
        "package_id": "execution-package-fcd55a17f36ff551ffd4", "task_closed": True,
        "post_execution_commit": {"result_record": {"result_id": "execution-result-47e9a71c8434f706b389", "final_status": "completed", "verification_status": "PASS", "completed_at": "2026-08-17T05:49:31+00:00", "action_results": actions}},
        "machine_action_evidence_resolutions": [{"observed_at": "2026-08-17T05:30:00+00:00", "iam": {"evidence": {"evidence_id": "evidence-iam"}}, "network": {"evidence": {"evidence_id": "evidence-network"}}}],
    }


def test_local_binding_comes_from_verified_execution_and_never_contains_secret():
    local = service._safe_local_environment(verified_package())
    assert local["environment_type"] == "LOCAL" and local["source"] == "VERIFIED_EXECUTION"
    assert [(x["service_id"], x["host"], x["port"]) for x in local["services"]] == [("founder_frontend", "127.0.0.1", 5173), ("founder_backend", "127.0.0.1", 8000)]
    assert local["database"]["type"] == "PostgreSQL" and local["database"]["credential_reference_exists"] is True
    assert local["database"]["secret_stored"] is False
    assert local["iam"]["type"] == "application-level HTTP Bearer RBAC"
    assert local["network"]["boundary"] == "loopback"
    serialized = str(local).lower()
    assert "password" not in serialized and "secret value" not in serialized and "postgresql://" not in serialized


def test_stage_placeholders_are_non_active_and_do_not_invent_bindings():
    nas, cloud = service._planned_environments()
    assert (nas["status"], nas["deployment_stage"], nas["services"]) == ("PLANNED", "NEXT_PLANNED", [])
    assert (cloud["status"], cloud["environment_type"], cloud["services"]) == ("NOT_CONFIGURED", "COMMERCIAL_CLOUD", [])
    assert not nas["credential_refs"] and not cloud["credential_refs"]


def test_fresh_healthy_active_binding_uses_registry_and_stale_routes_to_discovery():
    now = datetime(2026, 8, 17, 8, tzinfo=timezone.utc)
    environment = {"status": "ACTIVE", "health_status": "healthy", "last_verified_at": (now - timedelta(hours=2)).isoformat()}
    assert service.validate_environment(environment, now=now)["route"] == "registry"
    environment["last_verified_at"] = (now - timedelta(days=2)).isoformat()
    assert service.validate_environment(environment, now=now)["route"] == "autonomous_discovery"


def test_valid_registry_short_circuits_discovery(monkeypatch):
    monkeypatch.setattr(service, "lookup_runtime_environment", lambda kind: {"environment": {"environment_type": kind}, "validation": {"valid": True}})
    monkeypatch.setattr(service, "discover_iam_network_evidence", lambda path: (_ for _ in ()).throw(AssertionError("discovery must be fallback only")))
    assert service.resolve_runtime_environment("LOCAL")["resolution_source"] == "REGISTRY"


def test_invalid_local_binding_reuses_evidence_resolution_and_refreshes(monkeypatch):
    calls = []
    stale = {"environment": {"environment_type": "LOCAL"}, "validation": {"valid": False}}
    fresh = {"environment": {"environment_type": "LOCAL"}, "validation": {"valid": True}}
    monkeypatch.setattr(service, "lookup_runtime_environment", lambda kind: fresh if calls else stale)
    monkeypatch.setattr(service, "discover_iam_network_evidence", lambda path: {"resolution_status": "resolved", "secrets_read": False, "external_writes": False})
    monkeypatch.setattr(service, "_refresh_local_from_discovery", lambda evidence: calls.append(evidence))
    result = service.resolve_runtime_environment("LOCAL")
    assert result["resolution_source"] == "AUTONOMOUS_DISCOVERY"
    assert result["usable"] is True and len(calls) == 1
