from app.agents.base_agent import BaseAgent


class AgentRegistry:

    _agents = {}

    @classmethod
    def register(
        cls,
        name: str,
        agent: BaseAgent,
    ):

        cls._agents[name] = agent

    @classmethod
    def get(
        cls,
        name: str,
    ):

        return cls._agents.get(name)

    @classmethod
    def all(cls):

        return cls._agents