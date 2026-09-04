from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.artifact.model import ArtifactAssetDB
from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import GoalAssetDB
from app.core.memory.model import MemoryAssetDB
from app.core.reference.model import IntelligenceReferenceDB
from app.core.task_asset.model import TaskAssetDB
from app.database.base import Base
import app.founder_ai.intelligence_library as library
from app.founder_ai.orchestrator import build_execution_package, generate_task_asset_draft
from app.founder_ai.task_package import TaskPackageBuilder


def _database(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(library, "SessionLocal", factory)
    with factory() as session:
        session.add(ConversationDB(id="conv-library", system_id="founder_ai", title="Library"))
        session.add(GoalAssetDB(id="goal-library", conversation_id="conv-library", title="Library goal", description="Reuse intelligence"))
        session.add(TaskAssetDB(id="task-library", system_id="founder_ai", conversation_id="conv-library", title="Library task"))
        session.add(ArtifactAssetDB(id="artifact-v1", system_id="founder_ai", conversation_id="conv-library", artifact_type="document", title="Architecture", description="V1"))
        session.add_all([
            MemoryAssetDB(id="memory-v1", system_id="founder_ai", conversation_id="conv-library", memory_type="knowledge", title="Direction", content="Original", summary="Original summary"),
            MemoryAssetDB(id="memory-second", system_id="founder_ai", conversation_id="conv-library", memory_type="knowledge", title="Constraint", content="Keep history"),
        ])
        session.commit()
    return factory


def test_artifact_detail_version_status_and_history(monkeypatch):
    factory = _database(monkeypatch)
    version = library.create_artifact_version("artifact-v1", revision_reason="Architecture changed", summary="V2")
    assert version["version"] == 2
    assert version["previous_version_id"] == "artifact-v1"
    assert [item["version"] for item in version["history"]] == [2, 1]
    assert library.set_artifact_status(version["artifact_id"], "invalid")["status"] == "invalid"
    with factory() as session:
        assert session.get(ArtifactAssetDB, "artifact-v1").status == "superseded"
        assert session.query(ArtifactAssetDB).count() == 2


def test_memory_detail_revision_status_and_history(monkeypatch):
    factory = _database(monkeypatch)
    revision = library.revise_memory("memory-v1", revision_reason="Strategy changed", content="Revised")
    assert revision["revision_number"] == 2
    assert revision["previous_revision_id"] == "memory-v1"
    assert [item["revision_number"] for item in revision["history"]] == [2, 1]
    assert library.set_memory_status(revision["memory_id"], "outdated")["status"] == "outdated"
    with factory() as session:
        assert session.get(MemoryAssetDB, "memory-v1").status == "outdated"
        assert session.query(MemoryAssetDB).count() == 3


def test_reference_is_persisted_relation_and_target_can_read_it(monkeypatch):
    factory = _database(monkeypatch)
    relation = library.create_reference(source_type="artifact", source_id="artifact-v1", target_type="conversation", target_id="conv-library", note="Reuse architecture")
    assert relation["source_id"] == "artifact-v1"
    assert library.references_for_target("conversation", "conv-library")[0]["reference_id"] == relation["reference_id"]
    assert library.artifact_detail("artifact-v1")["references"][0]["target_id"] == "conv-library"
    assert library.library_context_for_targets([("conversation", "conv-library")])[0]["summary"] == "V1"
    with factory() as session:
        assert session.query(IntelligenceReferenceDB).count() == 1
        assert session.get(ArtifactAssetDB, "artifact-v1").description == "V1"


def test_goal_task_and_execution_targets_can_read_references(monkeypatch):
    _database(monkeypatch)
    monkeypatch.setattr(library, "get_execution_session", lambda identifier: (object(), object()) if identifier == "execution-library" else None)
    library.create_reference(source_type="artifact", source_id="artifact-v1", target_type="goal", target_id="goal-library")
    library.create_reference(source_type="memory", source_id="memory-v1", target_type="task_asset", target_id="task-library")
    library.create_reference(source_type="artifact", source_id="artifact-v1", target_type="execution", target_id="execution-library")
    assert library.references_for_target("goal", "goal-library")[0]["source_id"] == "artifact-v1"
    assert library.references_for_target("task_asset", "task-library")[0]["source_id"] == "memory-v1"
    assert library.references_for_target("execution", "execution-library")[0]["source_id"] == "artifact-v1"


def test_memory_merge_preserves_sources(monkeypatch):
    factory = _database(monkeypatch)
    merged = library.merge_memories(["memory-v1", "memory-second"], title="Consolidated", revision_reason="Remove duplication")
    assert merged["memory_type"] == "consolidated"
    with factory() as session:
        sources = session.query(MemoryAssetDB).filter(MemoryAssetDB.id.in_(["memory-v1", "memory-second"])).all()
        assert all(item.status == "merged" and item.merged_into_memory_id == merged["memory_id"] for item in sources)


def test_task_package_reads_resolved_library_references():
    draft = generate_task_asset_draft("Reuse architecture", context={"intelligence_references": [{"source_type": "artifact", "source_id": "artifact-v1", "summary": "Stable architecture", "target_type": "goal"}]})
    task_package = TaskPackageBuilder().build(build_execution_package(draft))
    assert task_package.evidence[0]["source"] == "artifact:artifact-v1"
    assert task_package.evidence[0]["fact"] == "Stable architecture"
