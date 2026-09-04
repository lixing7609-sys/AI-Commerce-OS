from datetime import datetime, timezone

from .model import UpgradeRequestDB


REQUEST_STATES = {"pending_review", "approved", "rejected"}


def analyze_learning_signal(signal: dict, *, thresholds: dict | None = None) -> dict:
    limits = {"performance_ms_p95": 1000.0, "stability_mean": 0.95, "user_satisfaction_mean": 0.80, **(thresholds or {})}
    metrics = signal.get("metrics") or {}
    findings = []
    performance = metrics.get("performance_ms", {}).get("p95")
    stability = metrics.get("stability", {}).get("mean")
    satisfaction = metrics.get("user_satisfaction", {}).get("mean")
    if performance is not None and performance > limits["performance_ms_p95"]:
        findings.append({"metric": "performance_ms", "severity": "high", "actual": performance, "threshold": limits["performance_ms_p95"]})
    if stability is not None and stability < limits["stability_mean"]:
        findings.append({"metric": "stability", "severity": "high", "actual": stability, "threshold": limits["stability_mean"]})
    if satisfaction is not None and satisfaction < limits["user_satisfaction_mean"]:
        findings.append({"metric": "user_satisfaction", "severity": "medium", "actual": satisfaction, "threshold": limits["user_satisfaction_mean"]})
    return {"upgrade_recommended": bool(findings), "findings": findings, "thresholds": limits}


def create_upgrade_request(session, *, signal: dict, thresholds: dict | None = None) -> UpgradeRequestDB | None:
    analysis = analyze_learning_signal(signal, thresholds=thresholds)
    if not analysis["upgrade_recommended"]:
        return None
    record = UpgradeRequestDB(
        capability_id=signal["capability_id"],
        source_version=signal.get("capability_version") or "unknown",
        learning_signal=dict(signal),
        proposal={"reason": "Learning signal crossed approved evaluation thresholds", "findings": analysis["findings"]},
    )
    session.add(record)
    session.flush()
    return record


def set_upgrade_request_status(record: UpgradeRequestDB, status: str, *, decision: dict | None = None) -> UpgradeRequestDB:
    if status not in REQUEST_STATES or record.status != "pending_review" or status == "pending_review":
        raise ValueError(f"Invalid upgrade request transition: {record.status} -> {status}")
    record.status = status
    record.founder_decision = dict(decision or {})
    record.updated_at = datetime.now(timezone.utc)
    return record
