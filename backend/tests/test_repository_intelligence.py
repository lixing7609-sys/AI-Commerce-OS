from pathlib import Path

from app.founder_ai.repository import ChangeImpactAnalyzer, CodeSearch, ComponentGraphBuilder, RepositoryIndexer
from app.founder_ai.reasoning import ReasoningContext, SinoReasoningEngine
from app.intelligence.context import FounderContext, ProjectState


def _repository(tmp_path: Path):
    files = {
        "frontend/src/App.jsx": 'import { Panel } from "./Panel.jsx";\nexport function App() { return <Panel />; }\n',
        "frontend/src/Panel.jsx": "export function Panel() { return <section>Evidence</section>; }\n",
        "frontend/src/styles.css": ".panel { display: grid; }\n",
        "backend/app/service.py": "from app.worker import Worker\n\nclass Service:\n    pass\n",
        "backend/app/worker.py": "class Worker:\n    pass\n",
        "frontend/node_modules/ignored.js": "export function Ignored() {}\n",
    }
    for relative, content in files.items():
        target = tmp_path / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    indexer = RepositoryIndexer(tmp_path)
    index = indexer.index()
    search = CodeSearch(tmp_path)
    graph = ComponentGraphBuilder(tmp_path).build(index)
    return index, search, graph


def test_repository_index_contains_files_directories_languages_and_components(tmp_path):
    index, _, _ = _repository(tmp_path)

    assert {item.path for item in index.files} >= {"frontend/src/App.jsx", "backend/app/service.py"}
    assert "frontend/node_modules/ignored.js" not in {item.path for item in index.files}
    assert index.languages["Python"] == 2
    assert {item.name for item in index.components} >= {"App", "Panel", "Service", "Worker"}
    assert "frontend/src" in index.directories


def test_code_search_returns_relevant_files_with_reason_and_context(tmp_path):
    index, search, _ = _repository(tmp_path)

    matches = search.search("Update Panel Evidence component", index)

    assert matches[0].path == "frontend/src/Panel.jsx"
    assert matches[0].reason
    assert "Evidence" in matches[0].match_context


def test_component_graph_resolves_frontend_and_backend_dependencies(tmp_path):
    _, _, graph = _repository(tmp_path)
    nodes = {item.path: item for item in graph.nodes}

    assert "frontend/src/Panel.jsx" in nodes["frontend/src/App.jsx"].relations
    assert "backend/app/worker.py" in nodes["backend/app/service.py"].relations


def test_change_impact_includes_reverse_dependencies_and_verification(tmp_path):
    index, search, graph = _repository(tmp_path)
    matches = search.search("Change Panel Evidence", index)

    impact = ChangeImpactAnalyzer().analyze("Change Panel Evidence", matches, graph)

    assert "frontend/src/Panel.jsx" in impact.affected_files
    assert "frontend/src/App.jsx" in impact.affected_files
    assert impact.risk_level in {"low", "medium", "high"}
    assert "Run frontend tests" in impact.verification_requirements
    assert "Build frontend" in impact.verification_requirements


def test_reasoning_includes_repository_code_evidence_and_concrete_tasks(tmp_path):
    index, search, graph = _repository(tmp_path)
    matches = search.search("Update Panel Evidence component", index)
    impact = ChangeImpactAnalyzer().analyze("Update Panel Evidence component", matches, graph)
    founder = FounderContext({}, [], [], [], ProjectState("execution"))
    context = ReasoningContext(
        project_state={"current_phase": "execution", "active_tasks": [], "blocked_items": []},
        memory=[],
        decision_history=[],
        task_assets=[],
        execution_history=[],
        roadmap={"current_phase": "Repository Intelligence", "future_phases": []},
        capability_map={"applications": [{"status": "active"}]},
        conversation_context={},
        project_context={},
        founder_context=founder,
        repository_context=index.summary(),
        code_context={"relevant_files": [item.to_dict() for item in matches], "component_graph": graph.to_dict()["nodes"], "impact": impact.to_dict()},
    )

    class Collector:
        def collect(self, **_kwargs):
            return context

    output, _ = SinoReasoningEngine(context_collector=Collector()).reason(user_goal="Update Panel Evidence component")
    code_evidence = next(item for item in output.evidence if item.source == "Code Evidence")

    assert code_evidence.metadata["relevant_files"][0]["path"] == "frontend/src/Panel.jsx"
    assert "frontend/src/Panel.jsx" in output.task_plan[0].title
    assert "Run frontend tests" in output.execution_requirement.verification
