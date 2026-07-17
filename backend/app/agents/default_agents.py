from app.agents.agent_registry import AgentRegistry
from app.agents.operational_agent import OperationalAgent


def register_default_agents() -> list[dict]:
    """
    注册 AI-Commerce-OS 默认 AI 员工。

    重复调用时会使用相同名称覆盖原实例，
    不会产生重复员工。
    """

    agents = [
        OperationalAgent(
            name="AI CEO",
            role="chief_executive",
            description="负责公司策略、经营分析与任务协调",
        ),
        OperationalAgent(
            name="产品 Agent",
            role="product_manager",
            description="负责产品规划、选品分析与商品优化",
        ),
        OperationalAgent(
            name="销售 Agent",
            role="sales_operator",
            description="负责客户跟进、销售分析与成交支持",
        ),
        OperationalAgent(
            name="财务 Agent",
            role="finance_manager",
            description="负责收入、成本、利润与财务报表分析",
        ),
        OperationalAgent(
            name="行政 Agent",
            role="administration_manager",
            description="负责日程、文档、提醒与内部协调",
        ),
    ]

    for agent in agents:
        agent.set_idle()
        AgentRegistry.register(agent)

    return AgentRegistry.list_status()