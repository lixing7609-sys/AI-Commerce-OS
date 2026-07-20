from app.agents.agent_registry import AgentRegistry
from app.agents.ai_ceo_agent import AICEOAgent
from app.agents.operational_agent import OperationalAgent
from app.agents.product_agent import ProductAgent
from app.agents.sales_agent import SalesAgent


def register_default_agents() -> list[dict]:
    """
    注册 AI-Commerce-OS 默认 AI 员工。

    重复调用时会使用相同名称覆盖原实例，
    不会产生重复员工。

    AI CEO（阶段 8A）使用 AICEOAgent，具备通过统一 LLM Gateway
    生成系统经营分析的真实能力；销售 Agent（阶段 8C）使用
    SalesAgent，具备销售机会分析/商品销售策略/销售运营建议的真实
    能力；产品 Agent（阶段 8D）使用 ProductAgent，具备商品机会
    分析/选品评估/商品组合与组货建议/上架准备清单的真实能力。
    其余 Agent 仍是 OperationalAgent 占位实现，业务能力将在后续
    阶段接入。
    """

    agents = [
        AICEOAgent(
            name="AI CEO",
            role="chief_executive",
            description="负责公司策略、经营分析与任务协调",
        ),
        ProductAgent(
            name="产品 Agent",
            role="product_manager",
            description="负责产品规划、选品分析与商品优化",
        ),
        SalesAgent(
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