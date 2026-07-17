from app.agents.base_agent import BaseAgent


class AgentRegistry:
    """
    AI-Commerce-OS Agent 注册中心。

    负责：

    - 注册 Agent
    - 查询单个 Agent
    - 查询全部 Agent
    - 批量启动 Agent
    - 批量停止 Agent
    - 输出 Dashboard 状态
    """

    _agents: dict[str, BaseAgent] = {}

    @classmethod
    def register(
        cls,
        agent: BaseAgent,
    ) -> BaseAgent:
        """
        注册一个 Agent。
        """

        cls._agents[agent.name] = agent
        return agent

    @classmethod
    def unregister(
        cls,
        name: str,
    ) -> bool:
        """
        注销一个 Agent。
        """

        if name not in cls._agents:
            return False

        del cls._agents[name]
        return True

    @classmethod
    def get(
        cls,
        name: str,
    ) -> BaseAgent | None:
        """
        根据名称获取 Agent。
        """

        return cls._agents.get(name)

    @classmethod
    def all(cls) -> dict[str, BaseAgent]:
        """
        获取全部 Agent 实例。
        """

        return cls._agents.copy()

    @classmethod
    def list_status(cls) -> list[dict]:
        """
        输出全部 Agent 状态。
        """

        return [
            agent.to_dict()
            for agent in cls._agents.values()
        ]

    @classmethod
    def start_all(cls) -> list[dict]:
        """
        启动全部 Agent。
        """

        for agent in cls._agents.values():
            agent.start()

        return cls.list_status()

    @classmethod
    def stop_all(cls) -> list[dict]:
        """
        停止全部 Agent。
        """

        for agent in cls._agents.values():
            agent.stop()

        return cls.list_status()

    @classmethod
    def set_all_idle(cls) -> list[dict]:
        """
        将全部 Agent 设置为待机。
        """

        for agent in cls._agents.values():
            agent.set_idle()

        return cls.list_status()

    @classmethod
    def count(cls) -> int:
        """
        返回已注册 Agent 数量。
        """

        return len(cls._agents)

    @classmethod
    def clear(cls) -> None:
        """
        清空注册中心。
        """

        cls._agents.clear()