from math import ceil

from sqlalchemy import select

from .model import EvolutionFeedbackDB


METRIC_NAMES = {"performance_ms", "stability", "compatibility", "user_satisfaction", "usage_count"}


def clean_feedback(payload: dict) -> dict:
    required = {"capability_id", "capability_version", "source_system", "metrics"}
    missing = sorted(required - payload.keys())
    if missing:
        raise ValueError(f"Missing feedback fields: {', '.join(missing)}")
    metrics = {}
    for name, value in dict(payload["metrics"]).items():
        if name not in METRIC_NAMES or not isinstance(value, (int, float)) or isinstance(value, bool):
            continue
        metrics[name] = max(0.0, float(value))
    if not metrics:
        raise ValueError("Feedback must contain at least one supported numeric metric")
    return {
        "capability_id": str(payload["capability_id"]).strip(),
        "capability_version": str(payload["capability_version"]).strip(),
        "source_system": str(payload["source_system"]).strip(),
        "metrics": metrics,
        "context": dict(payload.get("context") or {}),
    }


def receive_feedback(session, payload: dict) -> EvolutionFeedbackDB:
    cleaned = clean_feedback(payload)
    record = EvolutionFeedbackDB(**cleaned)
    session.add(record)
    session.flush()
    return record


def _percentile(values: list[float], percentile: float) -> float:
    ordered = sorted(values)
    return ordered[max(0, ceil(percentile * len(ordered)) - 1)]


def build_learning_signal(session, capability_id: str, capability_version: str | None = None) -> dict:
    query = select(EvolutionFeedbackDB).where(EvolutionFeedbackDB.capability_id == capability_id)
    if capability_version:
        query = query.where(EvolutionFeedbackDB.capability_version == capability_version)
    feedback = list(session.scalars(query.order_by(EvolutionFeedbackDB.received_at)))
    if not feedback:
        raise LookupError("No feedback available")
    values: dict[str, list[float]] = {}
    for record in feedback:
        for name, value in record.metrics.items():
            values.setdefault(name, []).append(float(value))
    return {
        "capability_id": capability_id,
        "capability_version": capability_version,
        "sample_count": len(feedback),
        "metrics": {
            name: {"mean": sum(samples) / len(samples), "p50": _percentile(samples, 0.50), "p95": _percentile(samples, 0.95)}
            for name, samples in values.items()
        },
        "sources": sorted({record.source_system for record in feedback}),
    }
