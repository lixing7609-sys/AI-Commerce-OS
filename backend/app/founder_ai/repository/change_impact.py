from dataclasses import asdict, dataclass

from app.founder_ai.repository.code_search import CodeMatch
from app.founder_ai.repository.component_graph import ComponentGraph


@dataclass(frozen=True, slots=True)
class ChangeImpact:
    affected_files: list[str]
    risk_level: str
    verification_requirements: list[str]

    def to_dict(self):
        return asdict(self)


class ChangeImpactAnalyzer:
    def analyze(self, proposed_change: str, matches: list[CodeMatch], graph: ComponentGraph) -> ChangeImpact:
        direct = {item.path for item in matches[:8]}
        affected = sorted(graph.affected_by(direct))
        crosses_boundary = any(path.startswith("frontend/") for path in affected) and any(path.startswith("backend/") for path in affected)
        risk = "high" if crosses_boundary or len(affected) > 12 else "medium" if len(affected) > 4 else "low"
        verification = []
        if any(path.startswith("backend/") for path in affected):
            verification.append("Run backend tests")
        if any(path.startswith("frontend/") for path in affected):
            verification.extend(["Run frontend tests", "Run frontend lint", "Build frontend"])
        if not verification:
            verification.append("Review repository changes")
        if risk == "high":
            verification.append("Run cross-boundary integration tests")
        return ChangeImpact(affected, risk, verification)
