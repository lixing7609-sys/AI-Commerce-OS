import pytest

from app.core.intelligence_evolution.evaluation import apply_evaluation, evaluate_upgrade, resolve_policy
from app.core.intelligence_evolution.model import UpgradeRequestDB


def test_dynamic_weights_change_by_type_and_scenario():
    generic = resolve_policy(capability_type="generic", scenario="default", risk_level="normal")
    financial = resolve_policy(capability_type="workflow", scenario="financial", risk_level="high")
    assert financial.weights["stability"] > generic.weights["stability"]
    assert financial.weights["compatibility"] >= 0.20
    assert financial.high_risk is True


def test_high_risk_evaluation_waits_for_founder_even_when_score_passes():
    request = UpgradeRequestDB(capability_id="capability-a", source_version="1.0.0")
    report = evaluate_upgrade(metrics={"performance": 1, "stability": 1, "compatibility": 1, "user_satisfaction": 1, "usage": 1}, risk_level="high")
    apply_evaluation(request, report)
    assert request.status == "pending_review"
    assert report["requires_founder_approval"] is True
    apply_evaluation(request, report, founder_decision="approved", actor="founder-1")
    assert request.status == "approved"


def test_normal_adjustment_is_resolved_automatically_from_evidence():
    request = UpgradeRequestDB(capability_id="capability-a", source_version="1.0.0")
    report = evaluate_upgrade(metrics={"performance": 0.95, "stability": 0.99, "compatibility": 0.9, "user_satisfaction": 0.9, "usage": 0.8})
    apply_evaluation(request, report)
    assert request.status == "approved"
    assert request.founder_decision["automatic"] is True


def test_invalid_founder_decision_does_not_bypass_gate():
    request = UpgradeRequestDB(capability_id="capability-a", source_version="1.0.0")
    report = evaluate_upgrade(metrics={"stability": 1, "compatibility": 1}, risk_level="critical")
    apply_evaluation(request, report, founder_decision="maybe")
    assert request.status == "pending_review"
