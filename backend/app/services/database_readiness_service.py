import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text

from app.database.db import engine

logger = logging.getLogger("app.database_readiness")

REQUIRED_TABLES = ("system_runtime_state", "tasks")

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
ALEMBIC_INI_PATH = BACKEND_DIR / "alembic.ini"


class DatabaseReadinessError(Exception):
    """
    数据库未就绪，或结构与代码预期不一致。

    错误信息只描述检查结果本身（连接是否成功、revision 是否一致、
    缺失哪些表），不包含数据库连接串或密码。
    """


@dataclass
class DatabaseReadinessResult:
    """
    check_ready() 成功时的返回结构。
    """

    ready: bool
    current_revision: str
    expected_revision: str
    missing_tables: list[str]
    checked_at: datetime


class DatabaseReadinessService:
    """
    应用启动前的数据库就绪检查。

    只做只读检查，不执行 migration，不创建表，
    不修改任何数据库数据。
    """

    @staticmethod
    def check_connection() -> None:
        """
        执行一次最轻量的连接探测（SELECT 1）。

        失败时抛出 DatabaseReadinessError，错误信息只包含
        异常类型，不包含连接串或密码。
        """

        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))

        except Exception as error:
            raise DatabaseReadinessError(
                f"数据库连接失败（{type(error).__name__}），"
                "请检查数据库是否正在运行"
            ) from error

    @staticmethod
    def get_current_revision() -> str:
        """
        查询 alembic_version 表中记录的当前 revision。

        表不存在、表为空、或存在多条记录时均抛出明确错误。
        """

        inspector = inspect(engine)

        if "alembic_version" not in inspector.get_table_names():
            raise DatabaseReadinessError(
                "alembic_version 表不存在，数据库尚未执行过任何迁移，"
                "请先执行：cd backend && uv run alembic upgrade head"
            )

        with engine.connect() as connection:
            rows = connection.execute(
                text("SELECT version_num FROM alembic_version")
            ).fetchall()

        if not rows:
            raise DatabaseReadinessError(
                "alembic_version 表中没有任何 revision 记录，"
                "请先执行：cd backend && uv run alembic upgrade head"
            )

        if len(rows) > 1:
            found = [row[0] for row in rows]
            raise DatabaseReadinessError(
                f"alembic_version 表中存在多条 revision 记录：{found}"
            )

        return rows[0][0]

    @staticmethod
    def get_expected_head_revision() -> str:
        """
        从当前代码里的 Alembic ScriptDirectory 读取 head revision。

        不在代码中手写固定 revision 字符串，
        存在多个 head 时抛出明确错误。
        """

        config = Config(str(ALEMBIC_INI_PATH))
        script = ScriptDirectory.from_config(config)

        heads = script.get_heads()

        if len(heads) == 0:
            raise DatabaseReadinessError(
                "Alembic migrations 目录中没有找到任何 revision"
            )

        if len(heads) > 1:
            raise DatabaseReadinessError(
                f"Alembic migrations 存在多个 head，无法确定期望 revision：{heads}"
            )

        return heads[0]

    @staticmethod
    def check_required_tables() -> list[str]:
        """
        检查必需的业务表是否存在，返回缺失表名列表。
        """

        inspector = inspect(engine)
        existing_tables = set(inspector.get_table_names())

        return [
            table_name
            for table_name in REQUIRED_TABLES
            if table_name not in existing_tables
        ]

    @staticmethod
    def check_ready() -> DatabaseReadinessResult:
        """
        执行完整的启动前就绪检查。

        任一环节失败都会抛出 DatabaseReadinessError 并中止，
        只有全部通过时才返回 ready=True 的结果。
        """

        checked_at = datetime.now(timezone.utc)

        logger.info("database readiness check started")

        DatabaseReadinessService.check_connection()

        current_revision = DatabaseReadinessService.get_current_revision()
        logger.info("current revision: %s", current_revision)

        expected_revision = (
            DatabaseReadinessService.get_expected_head_revision()
        )
        logger.info("expected revision: %s", expected_revision)

        missing_tables = DatabaseReadinessService.check_required_tables()
        logger.info("required tables status: missing=%s", missing_tables)

        failure_reasons = []

        if current_revision != expected_revision:
            failure_reasons.append(
                "revision 不一致："
                f"current={current_revision}, expected={expected_revision}"
            )

        if missing_tables:
            failure_reasons.append(f"缺少必需表：{missing_tables}")

        if failure_reasons:
            message = "；".join(failure_reasons)
            logger.error("database readiness check failed: %s", message)
            raise DatabaseReadinessError(message)

        logger.info("database readiness check passed")

        return DatabaseReadinessResult(
            ready=True,
            current_revision=current_revision,
            expected_revision=expected_revision,
            missing_tables=missing_tables,
            checked_at=checked_at,
        )
