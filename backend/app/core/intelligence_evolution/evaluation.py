from dataclasses import dataclass

from .evolution_engine import set_upgrade_request_status


DEFAULT_WEIGHTS = {"performance": 0.25, "stability": 0.30, "compatibility": 0.20, "user_satisfaction": 0.15, "usage": 0.10}
HIGH_RISK_FLOORS = {"stability": 0.30, "compatibility": 0.25}


@dataclass(frozen=True, slots=True)
class EvaluationPolicy:
    weights: dict[str, float]
    approval_threshold: float
    high_risk: bool


def resolve_policy(*, capability_type: str, scenario: str, risk_level: str, overrides: dict | None = None) -> EvaluationPolicy:
    weights = dict(DEFAULT_WEIGHTS)
    if capability_type == "workflow":
        weights.update({"stability": 0.35, "performance": 0.20})
    if scenario == "financial":
        weights.update({"stability": 0.40, "compatibility": 0.25, "performance": 0.15})
    weights.update(dict(overrides or {}))
    high_risk = risk_level in {"high", "critical"}
    if high_risk:
        for metric, floor in HIGH_RISK_FLOORS.items():
            weights[metric] = max(weights.get(metric, 0.0), floor)
    total = sum(weights.values())
    normalized = {metric: value / total for metric, value in weights.items()}
    return EvaluationPolicy(weights=normalized, approval_threshold=0.85 if high_risk else 0.75, high_risk=high_risk)


def evaluate_upgrade(*, metrics: dict[str, float], capability_type: str = "generic", scenario: str = "default", risk_level: str = "normal", overrides: dict | None = None) -> dict:
    policy = resolve_policy(capability_type=capability_type, scenario=scenario, risk_level=risk_level, overrides=overrides)
    normalized_metrics = {name: min(1.0, max(0.0, float(metrics.get(name, 0.0)))) for name in policy.weights}
    score = sum(normalized_metrics[name] * weight for name, weight in policy.weights.items())
    major_change = bool(metrics.get("major_change", False))
    requires_founder = policy.high_risk or major_change
    return {
        "score": score,
        "threshold": policy.approval_threshold,
        "passed": score >= policy.approval_threshold,
        "weights": policy.weights,
        "metrics": normalized_metrics,
        "risk_level": risk_level,
        "requires_founder_approval": requires_founder,
        "auto_action_allowed": not requires_founder,
    }


def apply_evaluation(request, report: dict, *, founder_decision: str | None = None, actor: str | None = None):
    if request.status is None:
        request.status = "pending_review"
    request.evaluation_report = dict(report)
    if report["requires_founder_approval"]:
        if founder_decision not in {"approved", "rejected"}:
            return request
        return set_upgrade_request_status(request, founder_decision, decision={"actor": actor or "founder", "decision": founder_decision})
    status = "approved" if report["passed"] else "rejected"
    return set_upgrade_request_status(request, status, decision={"actor": "sino", "decision": status, "automatic": True})
