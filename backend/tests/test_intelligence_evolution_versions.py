import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.intelligence_evolution.model import CapabilityVersionDB
from app.core.intelligence_evolution.version_repository import compare_versions, list_versions, register_version, rollback_version, transition_version


@pytest.fixture
def session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    CapabilityVersionDB.__table__.create(engine)
    with Session(engine) as value:
        yield value


def test_version_registration_query_and_comparison(session):
    first = register_version(session, capability_id="capability-a", version="1.0.0", dependencies=["core"], content={"mode": "stable"})
    second = register_version(session, capability_id="capability-a", version="1.1.0", dependencies=["core", "feedback"], content={"mode": "adaptive"})
    session.commit()

    assert {item.version for item in list_versions(session, "capability-a")} == {"1.0.0", "1.1.0"}
    assert compare_versions(first, second)["dependency_changes"] == {"removed": [], "added": ["feedback"]}
    assert compare_versions(first, second)["content_changed"] is True


def test_version_state_machine_requires_founder_for_formal_migration(session):
    record = register_version(session, capability_id="capability-a", version="2.0.0")
    transition_version(record, "learning")
    transition_version(record, "version_evolution")

    with pytest.raises(PermissionError):
        transition_version(record, "ready")

    assert transition_version(record, "ready", founder_approved=True).status == "ready"
    with pytest.raises(ValueError):
        transition_version(record, "deprecated")


def test_rollback_requires_founder_and_preserves_target(session):
    target = register_version(session, capability_id="capability-a", version="1.0.0")
    current = register_version(session, capability_id="capability-a", version="2.0.0")
    with pytest.raises(PermissionError):
        rollback_version(session, current=current, target=target, founder_approved=False)
    assert rollback_version(session, current=current, target=target, founder_approved=True) is target
    assert current.status == "deprecated"
