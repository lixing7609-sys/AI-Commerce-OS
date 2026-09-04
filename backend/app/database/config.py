import os
from dataclasses import dataclass

from sqlalchemy.engine import make_url


PRODUCTION_DATABASE_NAME = "ai_commerce_os"
TEST_DATABASE_NAME = "ai_commerce_os_test"
DEFAULT_PRODUCTION_DATABASE_URL = (
    "postgresql+psycopg://"
    "n8n:password123@localhost:5432/ai_commerce_os"
)
DEFAULT_TEST_DATABASE_URL = (
    "postgresql+psycopg://"
    "n8n:password123@localhost:5432/ai_commerce_os_test"
)


class UnsafeTestDatabaseError(RuntimeError):
    pass


@dataclass(frozen=True)
class DatabaseRuntimeConfig:
    url: str
    environment: str
    database_name: str
    testing: bool

    @property
    def safe_identity(self) -> str:
        parsed = make_url(self.url)
        return f"{parsed.host or 'local'}:{parsed.port or ''}/{self.database_name}"


def resolve_database_runtime_config(environ: dict[str, str] | None = None) -> DatabaseRuntimeConfig:
    values = os.environ if environ is None else environ
    testing = values.get("AI_COMMERCE_TESTING", "").strip().lower() in {"1", "true", "yes", "on"}
    default_url = DEFAULT_TEST_DATABASE_URL if testing else DEFAULT_PRODUCTION_DATABASE_URL
    url = values.get("DATABASE_URL") or default_url
    parsed = make_url(url)
    database_name = (parsed.database or "").strip()

    if testing:
        # Tests have one explicit database authority. This rejects production,
        # similarly named databases, and accidental operator-supplied targets
        # before SQLAlchemy creates an engine or opens a connection.
        if parsed.get_backend_name() != "postgresql" or database_name != TEST_DATABASE_NAME:
            raise UnsafeTestDatabaseError(
                f"unsafe_test_database:{parsed.get_backend_name()}:{database_name or 'missing'}"
            )

    return DatabaseRuntimeConfig(
        url=url,
        environment="test" if testing else "production",
        database_name=database_name,
        testing=testing,
    )
