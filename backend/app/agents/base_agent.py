from abc import ABC, abstractmethod


class BaseAgent(ABC):
    """
    所有 AI Agent 的基类。
    """

    name = "Base Agent"

    @abstractmethod
    def think(self, context: dict):
        """
        AI 思考。
        """
        pass

    @abstractmethod
    def execute(self, context: dict):
        """
        AI 执行。
        """
        pass

    def run(self, context: dict):
        """
        标准运行流程。
        """

        decision = self.think(context)

        return self.execute(decision)