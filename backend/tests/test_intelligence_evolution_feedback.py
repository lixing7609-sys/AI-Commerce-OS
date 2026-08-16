import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.intelligence_evolution.feedback_pipeline import build_learning_signal, clean_feedback, receive_feedback
from app.core.intelligence_evolution.model import EvolutionFeedbackDB


@pytest.fixture
def session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    EvolutionFeedbackDB.__table__.create(engine)
    with Session(engine) as value:
        yield value


def feedback(performance, stability, source="operator"):
    return {"capability_id": "capability-a", "capability_version": "1.0.0", "source_system": source, "metrics": {"performance_ms": performance, "stability": stability, "unsupported": "ignored"}}


def test_feedback_cleaning_rejects_invalid_payloads():
    with pytest.raises(ValueError):
        clean_feedback({"capability_id": "capability-a"})
    cleaned = clean_feedback(feedback(-10, 0.9))
    assert cleaned["metrics"] == {"performance_ms": 0.0, "stability": 0.9}


def test_feedback_pipeline_builds_deterministic_learning_signal(session):
    for payload in [feedback(100, 0.99), feedback(200, 0.95, "studio"), feedback(300, 0.90)]:
        receive_feedback(session, payload)
    session.commit()

    signal = build_learning_signal(session, "capability-a", "1.0.0")

    assert signal["sample_count"] == 3
    assert signal["metrics"]["performance_ms"] == {"mean": 200.0, "p50": 200.0, "p95": 300.0}
    assert signal["sources"] == ["operator", "studio"]
