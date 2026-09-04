from dataclasses import asdict, dataclass
from pathlib import Path
import re

from app.founder_ai.repository.repository_indexer import RepositoryIndex


@dataclass(frozen=True, slots=True)
class CodeMatch:
    path: str
    reason: str
    match_context: str
    score: int

    def to_dict(self):
        return asdict(self)


class CodeSearch:
    def __init__(self, root: Path):
        self.root = root.resolve()

    def search(self, goal: str, index: RepositoryIndex, *, limit: int = 12) -> list[CodeMatch]:
        tokens = self._tokens(goal)
        matches = []
        for item in index.files:
            path_text = item.path.casefold()
            path_score = sum(6 for token in tokens if token in path_text)
            target = self.root / item.path
            if item.size > 500_000:
                continue
            try:
                lines = target.read_text(encoding="utf-8", errors="ignore").splitlines()
            except OSError:
                continue
            best_line = ""
            content_score = 0
            for line in lines:
                lowered = line.casefold()
                score = sum(2 for token in tokens if token in lowered)
                if score > content_score:
                    content_score = score
                    best_line = line.strip()
            score = path_score + content_score
            if score:
                reasons = [token for token in tokens if token in path_text or token in best_line.casefold()]
                matches.append(CodeMatch(item.path, f"Matches goal terms: {', '.join(reasons[:5])}", best_line[:300] or item.path, score))
        return sorted(matches, key=lambda item: (-item.score, item.path))[:limit]

    @staticmethod
    def _tokens(goal: str) -> list[str]:
        raw = re.findall(r"[A-Za-z][A-Za-z0-9_-]+|[\u4e00-\u9fff]{2,}", goal.casefold())
        stop = {"the", "and", "with", "from", "into", "需要", "建立", "增加", "实现", "升级", "修复"}
        tokens = [item for item in raw if item not in stop]
        concepts = {
            "前端": ("frontend", "jsx", "component"),
            "后端": ("backend", "python", "api"),
            "执行": ("execution", "worker"),
            "推理": ("reasoning", "engine"),
            "仓库": ("repository",),
            "代码": ("code",),
            "证据": ("evidence",),
            "记忆": ("memory",),
        }
        for phrase, values in concepts.items():
            if phrase in goal:
                tokens.extend(values)
        return list(dict.fromkeys(tokens)) or [goal.casefold()]
