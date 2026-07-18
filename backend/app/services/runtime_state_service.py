from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError

from app.database.db import SessionLocal
from app.models.runtime_state_db import RuntimeStateDB

VALID_DESIRED_STATES = {"running", "stopped"}
VALID_ACTUAL_STATES = {"starting", "running", "stopping", "stopped", "error"}
VALID_SHUTDOWN_TYPES = {"graceful", "unexpected", "unknown"}

STATE_ROW_ID = 1


class RuntimeStateService:
    """
    system_runtime_state 持久化服务。

    只负责单行状态的读写，不做任何自动恢复决策，
    不调用 RuntimeEngine，数据库是唯一事实来源。
    """

    @staticmethod
    def get_or_create_state() -> RuntimeStateDB:
        """
        查询 id=1 的状态行，不存在时创建默认行。

        并发创建时依赖主键唯一约束：竞争失败的一方
        捕获 IntegrityError 后回滚并重新查询，
        避免产生重复行。
        """

        db = SessionLocal()

        try:
            state = (
                db.query(RuntimeStateDB)
                .filter(RuntimeStateDB.id == STATE_ROW_ID)
                .first()
            )

            if state is not None:
                return state

            state = RuntimeStateDB(
                id=STATE_ROW_ID,
                desired_state="stopped",
                actual_state="stopped",
                auto_resume_enabled=False,
                last_shutdown_type="unknown",
                recovery_failure_count=0,
            )

            db.add(state)

            try:
                db.commit()
            except IntegrityError:
                db.rollback()

                state = (
                    db.query(RuntimeStateDB)
                    .filter(RuntimeStateDB.id == STATE_ROW_ID)
                    .first()
                )
            else:
                db.refresh(state)

            return state

        finally:
            db.close()

    @staticmethod
    def get_state() -> RuntimeStateDB | None:
        """
        查询 id=1 的状态行，不存在时返回 None。
        """

        db = SessionLocal()

        try:
            return (
                db.query(RuntimeStateDB)
                .filter(RuntimeStateDB.id == STATE_ROW_ID)
                .first()
            )

        finally:
            db.close()

    @staticmethod
    def update_state(
        desired_state: str | None = None,
        actual_state: str | None = None,
        auto_resume_enabled: bool | None = None,
        last_started_at: datetime | None = None,
        last_stopped_at: datetime | None = None,
        last_heartbeat_at: datetime | None = None,
        last_shutdown_type: str | None = None,
        last_error: str | None = None,
        recovery_failure_count: int | None = None,
        clear_last_error: bool = False,
    ) -> RuntimeStateDB:
        """
        按需更新任意子集字段，未传入的字段保持原值。

        每次调用都会显式写入 updated_at（server_default
        只在 INSERT 时生效，UPDATE 需要应用层自行维护）。
        """

        if desired_state is not None and desired_state not in VALID_DESIRED_STATES:
            raise ValueError(f"非法 desired_state：{desired_state}")

        if actual_state is not None and actual_state not in VALID_ACTUAL_STATES:
            raise ValueError(f"非法 actual_state：{actual_state}")

        if (
            last_shutdown_type is not None
            and last_shutdown_type not in VALID_SHUTDOWN_TYPES
        ):
            raise ValueError(f"非法 last_shutdown_type：{last_shutdown_type}")

        db = SessionLocal()

        try:
            state = (
                db.query(RuntimeStateDB)
                .filter(RuntimeStateDB.id == STATE_ROW_ID)
                .first()
            )

            if state is None:
                raise ValueError(
                    "system_runtime_state 尚未初始化，"
                    "请先调用 get_or_create_state()"
                )

            if desired_state is not None:
                state.desired_state = desired_state

            if actual_state is not None:
                state.actual_state = actual_state

            if auto_resume_enabled is not None:
                state.auto_resume_enabled = auto_resume_enabled

            if last_started_at is not None:
                state.last_started_at = last_started_at

            if last_stopped_at is not None:
                state.last_stopped_at = last_stopped_at

            if last_heartbeat_at is not None:
                state.last_heartbeat_at = last_heartbeat_at

            if last_shutdown_type is not None:
                state.last_shutdown_type = last_shutdown_type

            if last_error is not None or clear_last_error:
                state.last_error = last_error

            if recovery_failure_count is not None:
                state.recovery_failure_count = recovery_failure_count

            state.updated_at = datetime.now(timezone.utc)

            db.commit()
            db.refresh(state)

            return state

        except Exception:
            db.rollback()
            raise

        finally:
            db.close()

    @staticmethod
    def set_desired_state(state: str) -> RuntimeStateDB:
        """
        设置用户意图（desired_state）。
        """

        RuntimeStateService.get_or_create_state()

        return RuntimeStateService.update_state(desired_state=state)

    @staticmethod
    def set_actual_state(
        state: str,
        error: str | None = None,
    ) -> RuntimeStateDB:
        """
        设置系统实际观测状态（actual_state）。

        error 仅在显式传入时写入 last_error，
        不传入时不会清空已有的 last_error。
        """

        RuntimeStateService.get_or_create_state()

        return RuntimeStateService.update_state(
            actual_state=state,
            last_error=error,
        )

    @staticmethod
    def set_auto_resume(enabled: bool) -> RuntimeStateDB:
        """
        设置自动恢复开关。
        """

        RuntimeStateService.get_or_create_state()

        return RuntimeStateService.update_state(auto_resume_enabled=enabled)

    @staticmethod
    def record_heartbeat() -> RuntimeStateDB:
        """
        更新最近一次心跳时间。
        """

        RuntimeStateService.get_or_create_state()

        return RuntimeStateService.update_state(
            last_heartbeat_at=datetime.now(timezone.utc)
        )

    @staticmethod
    def record_graceful_shutdown() -> RuntimeStateDB:
        """
        记录一次优雅关闭。

        只更新 last_shutdown_type、last_stopped_at 和
        actual_state，不改变 desired_state——
        desired_state 只反映用户意图，进程退出方式
        不应该改写用户的启停意图。
        """

        RuntimeStateService.get_or_create_state()

        db = SessionLocal()

        try:
            state = (
                db.query(RuntimeStateDB)
                .filter(RuntimeStateDB.id == STATE_ROW_ID)
                .first()
            )

            state.last_shutdown_type = "graceful"
            state.last_stopped_at = datetime.now(timezone.utc)
            state.actual_state = "stopped"
            state.updated_at = datetime.now(timezone.utc)

            db.commit()
            db.refresh(state)

            return state

        except Exception:
            db.rollback()
            raise

        finally:
            db.close()

    @staticmethod
    def increment_recovery_failure(error: str) -> RuntimeStateDB:
        """
        恢复失败计数加一，并记录失败原因。
        """

        current = RuntimeStateService.get_or_create_state()

        return RuntimeStateService.update_state(
            recovery_failure_count=current.recovery_failure_count + 1,
            last_error=error,
        )

    @staticmethod
    def reset_recovery_failure() -> RuntimeStateDB:
        """
        清零恢复失败计数，并同时清空 last_error。

        语义：重置失败计数意味着"认为恢复流程已经恢复
        健康"，此时继续保留上一次的失败原因会造成误导
        （看起来仍处于错误状态），因此一并清空。
        """

        RuntimeStateService.get_or_create_state()

        return RuntimeStateService.update_state(
            recovery_failure_count=0,
            clear_last_error=True,
        )
