from collections import deque

from app.runtime.task import Task


class TaskQueue:
    """
    AI-Commerce-OS 任务队列。

    负责：

    - 新任务入队
    - 待执行任务出队
    - 保存全部任务记录
    - 按任务编号查询
    - 输出任务状态统计
    """

    def __init__(self) -> None:
        self._queue: deque[Task] = deque()
        self._tasks: dict[str, Task] = {}

    def push(
        self,
        task: Task,
    ) -> Task:
        """
        将任务加入待执行队列。
        """

        self._queue.append(task)
        self._tasks[task.id] = task

        return task

    def pop(self) -> Task | None:
        """
        取出队列中的下一个待执行任务。
        """

        if not self._queue:
            return None

        return self._queue.popleft()

    def get(
        self,
        task_id: str,
    ) -> Task | None:
        """
        根据任务编号查询任务。
        """

        return self._tasks.get(task_id)

    def all(self) -> list[Task]:
        """
        获取全部任务记录。

        最新创建的任务排在前面。
        """

        return sorted(
            self._tasks.values(),
            key=lambda task: task.created_at,
            reverse=True,
        )

    def list_status(self) -> list[dict]:
        """
        输出全部任务的 API 数据。
        """

        return [
            task.to_dict()
            for task in self.all()
        ]

    def size(self) -> int:
        """
        返回当前待执行任务数量。
        """

        return len(self._queue)

    def total(self) -> int:
        """
        返回全部任务记录数量。
        """

        return len(self._tasks)

    def empty(self) -> bool:
        """
        判断待执行队列是否为空。
        """

        return len(self._queue) == 0

    def stats(self) -> dict:
        """
        返回任务状态统计。
        """

        tasks = list(self._tasks.values())

        return {
            "total": len(tasks),
            "pending": sum(
                1
                for task in tasks
                if task.status == "pending"
            ),
            "running": sum(
                1
                for task in tasks
                if task.status == "running"
            ),
            "completed": sum(
                1
                for task in tasks
                if task.status == "completed"
            ),
            "failed": sum(
                1
                for task in tasks
                if task.status == "failed"
            ),
            "queued": len(self._queue),
        }

    def clear(self) -> None:
        """
        清空队列和任务记录。

        主要用于开发测试。
        """

        self._queue.clear()
        self._tasks.clear()


task_queue = TaskQueue()