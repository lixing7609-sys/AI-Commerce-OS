import hashlib
from datetime import datetime, timezone
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[3]
_DOCS_ROOT = _REPO_ROOT / "docs"

_ALLOWED_EXTENSIONS = {".md", ".txt"}

_MAX_CONTENT_LENGTH = 20000
_CONTENT_TRUNCATED_SUFFIX = "\n\n（文档较长，已截断显示。）"
_MAX_DESCRIPTION_LENGTH = 160

# 目录白名单：只允许读取这些目录下的直接文件（不递归子目录），
# 目录名之外的任何路径一律不可达——document_id 由服务端扫描生成，
# 客户端永远不会传入原始文件路径，天然避免路径穿越。
_CATEGORY_LABELS = {
    "00-project": "项目架构",
    "01-reference-architecture": "项目架构",
    "02-specification": "系统规范",
    "03-domain": "系统规范",
    "04-agent": "Agent 定义",
    "operations": "运维记录",
}

# integrations 目录按文件名前缀细分为两个类别。
_INTEGRATIONS_DIR = "integrations"
_INTEGRATIONS_CATEGORY_BY_PREFIX = {
    "n8n": "n8n 集成",
    "wecom": "企业微信集成",
}

_ALLOWED_DIRS = set(_CATEGORY_LABELS) | {_INTEGRATIONS_DIR}


def _category_for(dir_name: str, file_stem: str) -> str | None:
    if dir_name in _CATEGORY_LABELS:
        return _CATEGORY_LABELS[dir_name]

    if dir_name == _INTEGRATIONS_DIR:
        for prefix, label in _INTEGRATIONS_CATEGORY_BY_PREFIX.items():
            if file_stem.startswith(prefix):
                return label

    return None


def _document_id(relative_path: str) -> str:
    return hashlib.sha256(relative_path.encode("utf-8")).hexdigest()[:16]


def _read_preview(path: Path) -> tuple[str, str]:
    """
    读取文档标题与摘要预览。

    只读取文件开头一小段文本（避免大文件影响列表接口性能），
    标题取第一个 Markdown 一级标题（# 开头），摘要取标题之后
    第一段非空文本，截断到 _MAX_DESCRIPTION_LENGTH。任一环节
    读取失败都安全降级为文件名本身，不抛出异常影响整体列表。
    """

    try:
        with path.open("r", encoding="utf-8", errors="ignore") as file:
            head = file.read(4000)
    except OSError:
        return path.stem, ""

    title = path.stem
    description_lines: list[str] = []
    found_title = False

    for line in head.splitlines():
        stripped = line.strip()

        if not found_title:
            if stripped.startswith("# "):
                title = stripped[2:].strip() or title
                found_title = True
            continue

        if not stripped:
            if description_lines:
                break
            continue

        if stripped.startswith("#"):
            break

        description_lines.append(stripped)

        if sum(len(part) for part in description_lines) >= _MAX_DESCRIPTION_LENGTH:
            break

    description = " ".join(description_lines)[:_MAX_DESCRIPTION_LENGTH]

    return title, description


def _scan_documents() -> list[dict]:
    documents: list[dict] = []

    if not _DOCS_ROOT.is_dir():
        return documents

    for dir_name in sorted(_ALLOWED_DIRS):
        dir_path = _DOCS_ROOT / dir_name

        if not dir_path.is_dir():
            continue

        for entry in sorted(dir_path.iterdir()):
            if not entry.is_file():
                continue

            if entry.suffix.lower() not in _ALLOWED_EXTENSIONS:
                continue

            category = _category_for(dir_name, entry.stem)

            if category is None:
                continue

            relative_path = f"docs/{dir_name}/{entry.name}"
            title, description = _read_preview(entry)

            try:
                mtime = entry.stat().st_mtime
                last_updated = datetime.fromtimestamp(
                    mtime, tz=timezone.utc
                ).isoformat()
            except OSError:
                last_updated = None

            documents.append(
                {
                    "id": _document_id(relative_path),
                    "title": title,
                    "category": category,
                    "last_updated": last_updated,
                    "description": description,
                    "_path": entry,
                }
            )

    return documents


class KnowledgeService:
    """
    系统文档知识库索引服务（阶段一：只读文档入口，不做向量检索）。

    文档来源严格限定在代码内置的目录白名单（docs/ 下的固定子
    目录）内，document_id 由服务端扫描时生成（相对路径的 SHA-256
    摘要前 16 位），客户端只能传入这个不透明 id，永远不会把原始
    文件路径交给客户端控制——从设计上排除路径穿越、任意文件读取、
    读取 .env / Git 配置 / 密钥文件等风险。
    """

    @staticmethod
    def list_documents() -> dict:
        documents = _scan_documents()

        items = [
            {key: value for key, value in doc.items() if key != "_path"}
            for doc in documents
        ]

        categories = sorted({item["category"] for item in items})

        return {
            "total": len(items),
            "categories": categories,
            "items": items,
        }

    @staticmethod
    def get_document(document_id: str) -> dict | None:
        for doc in _scan_documents():
            if doc["id"] != document_id:
                continue

            path: Path = doc["_path"]

            try:
                with path.open("r", encoding="utf-8", errors="ignore") as file:
                    content = file.read(_MAX_CONTENT_LENGTH + 1)
            except OSError:
                content = ""

            truncated = len(content) > _MAX_CONTENT_LENGTH

            if truncated:
                content = content[:_MAX_CONTENT_LENGTH] + _CONTENT_TRUNCATED_SUFFIX

            return {
                "id": doc["id"],
                "title": doc["title"],
                "category": doc["category"],
                "last_updated": doc["last_updated"],
                "description": doc["description"],
                "content": content,
                "truncated": truncated,
            }

        return None
