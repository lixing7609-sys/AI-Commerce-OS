import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.intelligence_evolution.evolution_engine import analyze_learning_signal, create_upgrade_request, set_upgrade_request_status
from app.core.intelligence_evolution.model import UpgradeRequestDB


@pytest.fixture
def session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    UpgradeRequestDB.__table__.create(engine)
    with Session(engine) as value:
        yield value


def signal(performance=500, stability=0.99):
    return {"capability_id": "capability-a", "capability_version": "1.0.0", "metrics": {"performance_ms": {"p95": performance}, "stability": {"mean": stability}}}


def test_evolution_engine_only_proposes_upgrade_when_threshold_is_crossed(session):
    assert analyze_learning_signal(signal())["upgrade_recommended"] is False
    assert create_upgrade_request(session, signal=signal()) is None

    request = create_upgrade_request(session, signal=signal(performance=1500))
    assert request.status == "pending_review"
    assert request.proposal["findings"][0]["metric"] == "performance_ms"


def test_upgrade_request_status_is_explicit_and_terminal(session):
    request = create_upgrade_request(session, signal=signal(stability=0.5))
    set_upgrade_request_status(request, "approved", decision={"actor": "founder"})
    assert request.status == "approved"
    assert request.founder_decision == {"actor": "founder"}
    with pytest.raises(ValueError):
        set_upgrade_request_status(request, "rejected")
