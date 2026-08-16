from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.intelligence_evolution.evaluation import apply_evaluation, evaluate_upgrade
from app.core.intelligence_evolution.evolution_engine import create_upgrade_request
from app.core.intelligence_evolution.feedback_pipeline import build_learning_signal, receive_feedback
from app.core.intelligence_evolution.model import CapabilityVersionDB, EvolutionFeedbackDB, UpgradeRequestDB
from app.core.intelligence_evolution.version_repository import list_versions, register_version, transition_version


def test_feedback_to_founder_approval_to_version_update():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    for table in (CapabilityVersionDB.__table__, EvolutionFeedbackDB.__table__, UpgradeRequestDB.__table__):
        table.create(engine)
    with Session(engine) as session:
        current = register_version(session, capability_id="capability-e2e", version="1.0.0", content={"contract": "v1"})
        for latency in (1200, 1500, 1800):
            receive_feedback(session, {"capability_id": "capability-e2e", "capability_version": "1.0.0", "source_system": "operator", "metrics": {"performance_ms": latency, "stability": 0.90}})
        signal = build_learning_signal(session, "capability-e2e", "1.0.0")
        request = create_upgrade_request(session, signal=signal)
        request.proposal = {**request.proposal, "target_version": "1.1.0"}
        transition_version(current, "learning")
        transition_version(current, "version_evolution")
        report = evaluate_upgrade(metrics={"performance": 0.9, "stability": 0.95, "compatibility": 1, "user_satisfaction": 0.9, "usage": 0.9}, risk_level="high")
        apply_evaluation(request, report, founder_decision="approved", actor="founder-e2e")
        target = register_version(session, capability_id="capability-e2e", version=request.proposal["target_version"], content=current.content)
        transition_version(current, "deprecated", founder_approved=True)
        session.commit()

        assert request.status == "approved"
        assert {item.version: item.status for item in list_versions(session, "capability-e2e")} == {"1.0.0": "deprecated", "1.1.0": "ready"}
        assert target.content == {"contract": "v1"}
