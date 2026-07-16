from collections import deque

from app.runtime.task import Task


class TaskQueue:

    def __init__(self):

        self._queue = deque()

    def push(
        self,
        task: Task,
    ):

        self._queue.append(task)

    def pop(self):

        if not self._queue:
            return None

        return self._queue.popleft()

    def size(self):

        return len(self._queue)

    def empty(self):

        return len(self._queue) == 0