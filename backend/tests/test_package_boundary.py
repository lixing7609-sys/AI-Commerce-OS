import ast
from pathlib import Path


DOMAIN_DIRS = (
    "application_system",
    "conversation",
    "context",
    "decision",
    "task_asset",
    "artifact",
    "memory",
)


def _core_python_files():
    root = Path(__file__).parents[1] / "core"
    return [path for name in DOMAIN_DIRS for path in (root / name).glob("*.py")]


def test_core_modules_have_no_app_imports():
    violations = []
    for path in _core_python_files():
        tree = ast.parse(path.read_text(), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom):
                names = [node.module or ""]
            else:
                continue
            if any(name == "app" or name.startswith("app.") for name in names):
                violations.append(str(path))
    assert violations == []


def test_core_models_import_independently():
    from core.application_system.model import ApplicationSystemDB
    from core.artifact.model import ArtifactAssetDB
    from core.context.model import ConversationContextDB
    from core.conversation.model import ConversationDB
    from core.decision.model import DecisionAssetDB
    from core.memory.model import MemoryAssetDB
    from core.task_asset.model import TaskAssetDB

    assert {
        ApplicationSystemDB.__tablename__,
        ConversationDB.__tablename__,
        ConversationContextDB.__tablename__,
        DecisionAssetDB.__tablename__,
        TaskAssetDB.__tablename__,
        ArtifactAssetDB.__tablename__,
        MemoryAssetDB.__tablename__,
    } == {
        "application_systems",
        "conversations",
        "conversation_contexts",
        "decision_assets",
        "task_assets",
        "artifact_assets",
        "memory_assets",
    }


def test_application_layer_consumes_canonical_models():
    from app.core.application_system.model import ApplicationSystemDB
    from app.core.artifact.model import ArtifactAssetDB
    from app.core.context.model import ConversationContextDB
    from app.core.conversation.model import ConversationDB
    from app.core.decision.model import DecisionAssetDB
    from app.core.memory.model import MemoryAssetDB
    from app.core.task_asset.model import TaskAssetDB
    from core.artifact.model import ArtifactAssetDB as CanonicalArtifactAssetDB

    assert ArtifactAssetDB is CanonicalArtifactAssetDB
    assert ApplicationSystemDB.__tablename__ == "application_systems"
    assert ConversationDB.__tablename__ == "conversations"
    assert ConversationContextDB.__tablename__ == "conversation_contexts"
    assert DecisionAssetDB.__tablename__ == "decision_assets"
    assert TaskAssetDB.__tablename__ == "task_assets"
    assert MemoryAssetDB.__tablename__ == "memory_assets"
