import asyncio
import logging
from datetime import datetime, timezone

from app.models.task_execution import TaskExecutionResult
from app.runtime.engine.runtime_engine import runtime_engine
from app.services.task_execution_service import TaskExecutionService

logger = logging.getLogger("app.task_consumer")

# 无任务 / Runtime 未运行时的空闲等待时长，以及迭代异常后的退避
# 时长。定义为模块级变量（而不是方法默认参数），使测试可以直接
# monkeypatch 这两个模块属性来加速测试，无需真实等待。
IDLE_POLL_INTERVAL_SECONDS = 2.0
ERROR_BACKOFF_SECONDS = 2.0
SHUTDOWN_TIMEOUT_SECONDS = 10.0

_FINALIZED_OUTCOMES = ("completed", "failed", "state_conflict")


class TaskConsumerService:
    """
    单进程、单消费者、串行消费 pending 任务的后台循环。

    生命周期与 backend 进程绑定：main.py lifespan 是唯一的创建点
    （在其异步上下文里调用 start()，因此 asyncio.create_task 永远
    在 backend 主事件循环里执行），在 shutdown 时停止并 await；不
    随业务层面的 Runtime start/stop 反复创建/销毁。

    Runtime 手动 start/stop（backend/app/api/v1/runtime.py 的
    start_runtime/stop_runtime）都是同步 def 路由，FastAPI 会把它
    们放到线程池工作线程执行，那些线程没有正在运行的事件循环，
    不能安全调用 asyncio.create_task()——因此这两个路由只调用
    wake()，从不调用 start()。消费者若因未预期异常提前退出，
    这两个同步路由不会尝试在线程池线程里重建它（那样不安全）；
    唯一支持的恢复方式是重启 backend 进程（重新触发 lifespan），
    本轮不实现更复杂的主循环监督/自动重启机制。

    循环在每次迭代开始时检查 runtime_engine.running：

    - Runtime 未运行：不领取任务，等待信号或超时后重新检查；
    - Runtime 运行中：调用一次
      TaskExecutionService.process_next_pending_task()（阶段性
      "领取→执行→写回"整体在工作线程中同步完成），等待其返回后才
      进入下一轮迭代——因此任意时刻最多只有一次
      asyncio.to_thread 在执行，不存在两个 Agent 并发执行的情况。

    本服务不做批量领取、不做自动重试、不创建多个消费者、不使用
    线程池或 multiprocessing 管理器（只使用 asyncio 默认线程池
    执行同步的 TaskExecutionService 调用）。
    """

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._wake_event: asyncio.Event | None = None
        self._stop_requested = False

        self._current_task_id: str | None = None
        self._processed_count = 0
        self._completed_count = 0
        self._failed_count = 0
        self._conflict_count = 0
        self._last_outcome: str | None = None
        self._last_error_type: str | None = None
        self._started_at: datetime | None = None
        self._stopped_at: datetime | None = None

    # ------------------------------------------------------------------
    # 生命周期
    # ------------------------------------------------------------------

    def start(self) -> None:
        """
        幂等启动消费者循环：若已存在正在运行的消费者任务，直接
        返回，不重复创建 asyncio.Task。

        只能在有运行中事件循环的线程调用——本服务唯一预期的调用
        方是 main.py lifespan 的异步上下文（或测试中
        asyncio.run() 包裹的协程内部）。业务层面的 Runtime 手动
        start/stop 是同步路由，在 FastAPI 线程池工作线程执行，
        不会、也不应该调用本方法（它们只调用 wake()）；因此本方法
        不提供"从无事件循环的线程安全调用"的兼容路径——若确实在
        没有运行中事件循环的线程调用，直接让
        asyncio.get_running_loop() 的 RuntimeError 抛出，调用方
        必须自行避免这种用法。
        """

        if self._task is not None and not self._task.done():
            return

        loop = asyncio.get_running_loop()

        self._loop = loop
        self._stop_requested = False
        self._wake_event = asyncio.Event()
        self._task = loop.create_task(self._run_loop())
        self._started_at = datetime.now(timezone.utc)
        self._stopped_at = None

        logger.info("task consumer started")

    async def stop(self, timeout: float | None = None) -> None:
        """
        真正停止消费者循环，仅用于 backend 进程 shutdown（不用于
        业务层面的 Runtime 手动 stop——那种场景只需要 wake()，让
        消费者在下一次检查时发现 runtime_engine.running 已经是
        False，自然停止领取新任务，消费者本身继续存活）。

        请求停止 + 唤醒后，在有限超时内等待循环协程自然退出；若
        当前正处于 asyncio.to_thread 执行同步 Agent 阶段，不强制
        终止该工作线程——超时后只取消包裹用的 asyncio.Task，明确
        记录同步线程可能仍在后台继续运行直至自然结束，不谎称已经
        停止。
        """

        if self._task is None:
            return

        actual_timeout = (
            timeout if timeout is not None else SHUTDOWN_TIMEOUT_SECONDS
        )

        self._stop_requested = True
        self.wake()

        task = self._task

        try:
            await asyncio.wait_for(task, timeout=actual_timeout)
        except asyncio.TimeoutError:
            logger.warning(
                "task consumer stop timed out after %.1fs; wrapper task "
                "cancelled; any in-flight synchronous work already "
                "running in a worker thread may continue in the "
                "background until it finishes naturally",
                actual_timeout,
            )
        except asyncio.CancelledError:
            raise
        finally:
            # 清空 _task/_loop/_wake_event/_stop_requested，避免
            # 之后误用已经失效的旧 loop/event；下一次 start() 会
            # 在调用时所在的（新的）运行中事件循环里重新创建这些
            # 对象，不会复用这里清空掉的旧引用。
            self._task = None
            self._loop = None
            self._wake_event = None
            self._stop_requested = False
            self._stopped_at = datetime.now(timezone.utc)
            logger.info("task consumer stopped")

    def is_running(self) -> bool:
        return self._task is not None and not self._task.done()

    def wake(self) -> None:
        """
        线程安全的唤醒信号：可以从事件循环线程或任意工作线程
        （例如同步的 Runtime start/stop 路由所在的 FastAPI
        threadpool 线程）调用。
        """

        loop = self._loop

        if loop is None:
            return

        try:
            loop.call_soon_threadsafe(self._set_wake_event)
        except RuntimeError:
            pass

    def _set_wake_event(self) -> None:
        if self._wake_event is not None:
            self._wake_event.set()

    def get_status(self) -> dict:
        return {
            "running": self.is_running(),
            "stop_requested": self._stop_requested,
            "current_task_id": self._current_task_id,
            "processed_count": self._processed_count,
            "completed_count": self._completed_count,
            "failed_count": self._failed_count,
            "conflict_count": self._conflict_count,
            "last_outcome": self._last_outcome,
            "last_error_type": self._last_error_type,
            "started_at": self._started_at,
            "stopped_at": self._stopped_at,
        }

    def reset_for_tests(self) -> None:
        """
        仅供测试使用：强制清空内部状态。调用方必须自行确保没有
        残留的 asyncio.Task（例如先 await stop()），本方法不会
        取消或 await 任何任务。
        """

        self._task = None
        self._loop = None
        self._wake_event = None
        self._stop_requested = False
        self._current_task_id = None
        self._processed_count = 0
        self._completed_count = 0
        self._failed_count = 0
        self._conflict_count = 0
        self._last_outcome = None
        self._last_error_type = None
        self._started_at = None
        self._stopped_at = None

    # ------------------------------------------------------------------
    # 主循环
    # ------------------------------------------------------------------

    async def _run_loop(self) -> None:
        try:
            while not self._stop_requested:
                if not runtime_engine.running:
                    await self._wait_for_wake_or_timeout(
                        IDLE_POLL_INTERVAL_SECONDS
                    )
                    continue

                try:
                    result = await asyncio.to_thread(
                        TaskExecutionService.process_next_pending_task
                    )
                except asyncio.CancelledError:
                    raise
                except Exception as error:
                    # 单次迭代级别的未预期异常：视为可恢复，记录
                    # 安全错误类型后退避重试，循环本身不退出。
                    self._last_error_type = type(error).__name__
                    logger.error(
                        "task consumer iteration failed: error_type=%s",
                        type(error).__name__,
                    )
                    await self._wait_for_wake_or_timeout(
                        ERROR_BACKOFF_SECONDS
                    )
                    continue

                self._apply_result(result)

                if result.outcome in ("no_task", "runtime_stopped"):
                    await self._wait_for_wake_or_timeout(
                        IDLE_POLL_INTERVAL_SECONDS
                    )
                # completed / failed / state_conflict：立即进入下一轮
                # 迭代尝试领取下一条，不等待。
        except asyncio.CancelledError:
            logger.info("task consumer loop cancelled")
            raise
        except Exception as error:
            # 循环体自身（而不是被上面内层 try/except 覆盖的单次
            # 迭代）出现未预期异常：视为不可恢复，记录清晰的"意外
            # 退出"日志和安全错误类型后让协程正常返回（不重新抛出
            # 、不产生 asyncio 的"Task exception was never
            # retrieved"噪音日志），is_running() 会立即反映为
            # False。本轮不实现自动重启/监督，需要重启 backend 或
            # 后续引入监督机制才能恢复。
            self._last_error_type = type(error).__name__
            logger.error(
                "task consumer exited unexpectedly: error_type=%s",
                type(error).__name__,
            )

    def _apply_result(self, result: TaskExecutionResult) -> None:
        self._last_outcome = result.outcome
        self._last_error_type = result.error_type

        if result.outcome in _FINALIZED_OUTCOMES:
            self._processed_count += 1
            self._current_task_id = result.task_id

        if result.outcome == "completed":
            self._completed_count += 1
            logger.info(
                "task consumer completed task: task_id=%s",
                result.task_id,
            )
        elif result.outcome == "failed":
            self._failed_count += 1
            logger.error(
                "task consumer failed task: task_id=%s error_type=%s",
                result.task_id,
                result.error_type,
            )
        elif result.outcome == "state_conflict":
            self._conflict_count += 1
            logger.warning(
                "task consumer state conflict: task_id=%s",
                result.task_id,
            )
        elif result.outcome == "no_task":
            logger.debug("task consumer idle: no pending task")
        elif result.outcome == "runtime_stopped":
            logger.debug("task consumer idle: runtime stopped")

    async def _wait_for_wake_or_timeout(self, timeout: float) -> None:
        if self._wake_event is None:
            await asyncio.sleep(timeout)
            return

        try:
            await asyncio.wait_for(
                self._wake_event.wait(), timeout=timeout
            )
            woken = True
        except asyncio.TimeoutError:
            woken = False

        self._wake_event.clear()

        if woken:
            logger.debug("task consumer awakened")


task_consumer_service = TaskConsumerService()
