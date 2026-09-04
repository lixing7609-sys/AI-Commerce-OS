import ast
from dataclasses import asdict, dataclass
from pathlib import Path
import posixpath
import re

from app.founder_ai.repository.repository_indexer import RepositoryIndex


@dataclass(frozen=True, slots=True)
class ComponentNode:
    component: str
    path: str
    imports: list[str]
    relations: list[str]


@dataclass(frozen=True, slots=True)
class ComponentGraph:
    nodes: list[ComponentNode]

    def to_dict(self):
        return {"nodes": [asdict(item) for item in self.nodes]}

    def affected_by(self, paths: set[str]) -> set[str]:
        affected = set(paths)
        changed = True
        while changed:
            changed = False
            for node in self.nodes:
                if node.path not in affected and any(item in affected for item in node.relations):
                    affected.add(node.path)
                    changed = True
        return affected


class ComponentGraphBuilder:
    def __init__(self, root: Path):
        self.root = root.resolve()

    def build(self, index: RepositoryIndex) -> ComponentGraph:
        known = {item.path for item in index.files}
        components = {item.path: item.name for item in index.components}
        nodes = []
        for item in index.files:
            if item.language not in {"Python", "JavaScript", "JavaScript JSX", "TypeScript", "TypeScript JSX"}:
                continue
            imports = self._imports(item.path)
            relations = [resolved for value in imports if (resolved := self._resolve(item.path, value, known))]
            nodes.append(ComponentNode(components.get(item.path, Path(item.path).stem), item.path, imports, list(dict.fromkeys(relations))))
        return ComponentGraph(nodes)

    def _imports(self, relative: str) -> list[str]:
        path = self.root / relative
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            return []
        if path.suffix == ".py":
            try:
                tree = ast.parse(content)
            except SyntaxError:
                return []
            values = []
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    values.extend(alias.name for alias in node.names)
                elif isinstance(node, ast.ImportFrom) and node.module:
                    values.append(node.module)
            return values
        return re.findall(r"(?:import|export)\s+(?:[^'\"]+?\s+from\s+)?['\"]([^'\"]+)['\"]", content)

    @staticmethod
    def _resolve(source: str, imported: str, known: set[str]) -> str | None:
        if source.startswith("backend/") and imported.startswith("app."):
            candidate = "backend/" + imported.replace(".", "/")
            for value in (candidate + ".py", candidate + "/__init__.py"):
                if value in known:
                    return value
        if imported.startswith("."):
            normalized = posixpath.normpath(posixpath.join(posixpath.dirname(source), imported))
            candidates = [normalized, *(normalized + suffix for suffix in (".js", ".jsx", ".ts", ".tsx", ".py")), *(normalized + "/index" + suffix for suffix in (".js", ".jsx", ".ts", ".tsx"))]
            return next((item for item in candidates if item in known), None)
        return None


# Public architecture name requested by the Founder contract.
ComponentGraphEngine = ComponentGraphBuilder
