from dataclasses import asdict, dataclass
from pathlib import Path
import re


LANGUAGES = {
    ".py": "Python",
    ".js": "JavaScript",
    ".jsx": "JavaScript JSX",
    ".ts": "TypeScript",
    ".tsx": "TypeScript JSX",
    ".css": "CSS",
    ".html": "HTML",
    ".json": "JSON",
    ".md": "Markdown",
    ".sql": "SQL",
    ".yml": "YAML",
    ".yaml": "YAML",
}
IGNORED_DIRECTORIES = {".git", ".venv", "node_modules", "dist", ".pytest_cache", "__pycache__", ".founder-execution", "e2e-report", "test-results"}


@dataclass(frozen=True, slots=True)
class RepositoryFile:
    path: str
    language: str
    size: int


@dataclass(frozen=True, slots=True)
class RepositoryComponent:
    name: str
    path: str
    kind: str


@dataclass(frozen=True, slots=True)
class RepositoryIndex:
    root: str
    files: list[RepositoryFile]
    directories: list[str]
    languages: dict[str, int]
    components: list[RepositoryComponent]

    def to_dict(self):
        return asdict(self)

    def summary(self):
        return {
            "root": self.root,
            "file_count": len(self.files),
            "directory_count": len(self.directories),
            "languages": dict(self.languages),
            "components": [asdict(item) for item in self.components[:100]],
        }


class RepositoryIndexer:
    """Builds a safe source index limited to the frontend and backend trees."""

    def __init__(self, root: Path | None = None):
        self.root = (root or Path(__file__).resolve().parents[4]).resolve()
        self._cache: RepositoryIndex | None = None

    def index(self, *, refresh: bool = False) -> RepositoryIndex:
        if self._cache is not None and not refresh:
            return self._cache
        files = []
        directories = set()
        languages: dict[str, int] = {}
        components = []
        for scope in ("frontend", "backend"):
            base = self.root / scope
            if not base.is_dir():
                continue
            for path in base.rglob("*"):
                relative = path.relative_to(self.root)
                if any(part in IGNORED_DIRECTORIES for part in relative.parts):
                    continue
                if path.is_symlink():
                    continue
                if path.is_dir():
                    directories.add(relative.as_posix())
                    continue
                language = LANGUAGES.get(path.suffix.lower())
                if language is None:
                    continue
                item = RepositoryFile(relative.as_posix(), language, path.stat().st_size)
                files.append(item)
                languages[language] = languages.get(language, 0) + 1
                components.extend(self._components(path, item.path, language))
        self._cache = RepositoryIndex(str(self.root), sorted(files, key=lambda item: item.path), sorted(directories), dict(sorted(languages.items())), components)
        return self._cache

    @staticmethod
    def _components(path: Path, relative: str, language: str) -> list[RepositoryComponent]:
        if path.stat().st_size > 500_000:
            return []
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            return []
        if language in {"JavaScript JSX", "TypeScript JSX"}:
            names = re.findall(r"(?:export\s+default\s+|export\s+)?(?:function|class)\s+([A-Z][A-Za-z0-9_]*)", content)
            return [RepositoryComponent(name, relative, "ui_component") for name in dict.fromkeys(names)]
        if language == "Python":
            names = re.findall(r"^class\s+([A-Za-z_][A-Za-z0-9_]*)", content, re.MULTILINE)
            return [RepositoryComponent(name, relative, "python_class") for name in dict.fromkeys(names)]
        return []
