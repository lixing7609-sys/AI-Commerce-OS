"""
成果内容提取与渲染（阶段 8E）。

只从 Task.result（agent.run() 返回的完整信封，形如
{"success": true, "agent": ..., "decision": ..., "result": {...}}）
中挑选已经在 app.agents.*_response 里完成白名单清洗的结构化字段，
不复制保存 Provider 原始响应、system prompt、API Key、完整内部
Context 或 traceback——这些字段从未出现在 parse_*_response() 的
输出里，因此本模块天然不会接触到它们。

render_markdown_body() 把结构化内容渲染成纯文本/Markdown，同时
供 DeliverableVersion.content 落库和 Markdown 导出复用，避免维护
两份渲染逻辑。
"""

from typing import Any

_UNSUPPORTED_STATUSES = {"unsupported_task", "capability_not_implemented"}

_ANALYSIS_TYPE_MAP = {
    "system_operations": ("ceo_analysis", "analysis"),
    "sales_strategy": ("sales_analysis", "sales_analysis"),
    "product_strategy": ("product_analysis", "product_analysis"),
}

DELIVERABLE_TYPE_TITLE_PREFIX = {
    "ceo_analysis": "经营分析",
    "sales_analysis": "销售分析",
    "product_analysis": "产品分析",
    "general_result": "任务成果",
}


def extract_deliverable_content(
    assigned_agent: str | None, task_result: dict[str, Any] | None
) -> dict[str, Any] | None:
    """
    从任务信封中提取可交付内容。

    返回 None 表示"不应生成成果"（unsupported_task/
    capability_not_implemented/结构缺失）；否则返回
    {"deliverable_type", "format", "structured_content", "summary"}。
    """

    if not isinstance(task_result, dict):
        return None

    inner = task_result.get("result")

    if not isinstance(inner, dict):
        return None

    status = inner.get("status")
    if isinstance(status, str) and status in _UNSUPPORTED_STATUSES:
        return None

    analysis_type = inner.get("analysis_type")

    if analysis_type in _ANALYSIS_TYPE_MAP:
        deliverable_type, content_key = _ANALYSIS_TYPE_MAP[analysis_type]
        structured_content = inner.get(content_key)

        if not isinstance(structured_content, dict):
            return None

        format_ = inner.get("format") if inner.get("format") in ("structured", "text") else "structured"

        summary = (
            structured_content.get("summary")
            if format_ == "structured"
            else structured_content.get("text")
        )
        summary = str(summary or "")[:500]

        return {
            "deliverable_type": deliverable_type,
            "format": format_,
            "structured_content": structured_content,
            "summary": summary,
        }

    # general_result：当前没有已注册 Agent 会走到这个分支（AI
    # CEO/销售/产品三类都命中上面的映射，OperationalAgent 恒为
    # capability_not_implemented 已被上面过滤），为未来新增 Agent
    # 预留：只有明确存在非空 dict 内容时才生成，避免空成果。
    if not inner or not isinstance(inner, dict):
        return None

    # 排除掉已知的元数据字段后，若还剩下非空内容才算"存在可交付
    # 内容"；否则视为没有真正的业务结果，不生成成果。
    ignored_keys = {"agent", "analysis_type", "generated_at", "provider", "model", "usage", "format"}
    remaining = {k: v for k, v in inner.items() if k not in ignored_keys and v}

    if not remaining:
        return None

    return {
        "deliverable_type": "general_result",
        "format": "structured",
        "structured_content": remaining,
        "summary": str(remaining.get("summary", ""))[:500],
    }


def build_title(task_type: str, deliverable_type: str) -> str:
    prefix = DELIVERABLE_TYPE_TITLE_PREFIX.get(deliverable_type, "任务成果")
    task_type = (task_type or "").strip()

    if not task_type:
        return prefix

    return f"{prefix}：{task_type}"[:500]


def _render_list_section(title: str, items: list) -> list[str]:
    if not items:
        return []

    lines = [f"### {title}", ""]
    for item in items:
        lines.append(f"- {item}")
    lines.append("")
    return lines


def render_markdown_body(deliverable_type: str, format_: str, structured_content: dict) -> str:
    """
    把结构化成果内容渲染为 Markdown 正文（不含标题/来源任务等元
    信息，那部分由导出服务单独拼接）。text 格式直接渲染为一段
    纯文本。
    """

    if format_ == "text":
        text = str(structured_content.get("text", "")).strip()
        return text or "（暂无内容）"

    lines: list[str] = []

    summary = structured_content.get("summary")
    if summary:
        lines.append(str(summary))
        lines.append("")

    if deliverable_type == "ceo_analysis":
        lines += _render_list_section("发现", structured_content.get("findings") or [])
        lines += _render_list_section("风险", structured_content.get("risks") or [])
        lines += _render_list_section("行动建议", structured_content.get("actions") or [])

        delegations = structured_content.get("delegations") or []
        if delegations:
            lines.append("### 委派")
            lines.append("")
            for item in delegations:
                if isinstance(item, dict):
                    lines.append(
                        f"- 【{item.get('assigned_agent', '')}】"
                        f"{item.get('task', '')}（优先级：{item.get('priority', '')}）"
                    )
            lines.append("")

    elif deliverable_type == "sales_analysis":
        lines += _render_list_section("已知事实", structured_content.get("known_facts") or [])
        lines += _render_list_section("数据缺口", structured_content.get("data_gaps") or [])

        opportunities = structured_content.get("opportunities") or []
        if opportunities:
            lines.append("### 销售机会")
            lines.append("")
            for item in opportunities:
                if isinstance(item, dict):
                    lines.append(f"- {item.get('title', '')}：{item.get('reason', '')}")
            lines.append("")

        strategy = structured_content.get("strategy") or {}
        if isinstance(strategy, dict) and any(strategy.values()):
            lines.append("### 销售策略")
            lines.append("")
            if strategy.get("target"):
                lines.append(f"- 目标：{strategy['target']}")
            if strategy.get("positioning"):
                lines.append(f"- 定位：{strategy['positioning']}")
            lines += _render_list_section("渠道计划", strategy.get("channel_plan") or [])
            lines += _render_list_section("内容计划", strategy.get("content_plan") or [])
            lines += _render_list_section("转化计划", strategy.get("conversion_plan") or [])

        actions_today = structured_content.get("actions_today") or []
        if actions_today:
            lines.append("### 今日行动")
            lines.append("")
            for item in actions_today:
                if isinstance(item, dict):
                    lines.append(
                        f"- 【{item.get('priority', '')}】{item.get('action', '')}"
                        f"（负责：{item.get('owner', '')}）"
                    )
            lines.append("")

        lines += _render_list_section("所需输入", structured_content.get("required_inputs") or [])
        lines += _render_list_section("风险提醒", structured_content.get("warnings") or [])

    elif deliverable_type == "product_analysis":
        lines += _render_list_section("已知事实", structured_content.get("known_facts") or [])
        lines += _render_list_section(
            "合理假设", structured_content.get("reasonable_assumptions") or []
        )
        lines += _render_list_section("数据缺口", structured_content.get("data_gaps") or [])

        verdict = structured_content.get("selection_verdict") or {}
        if isinstance(verdict, dict) and verdict.get("product"):
            lines.append("### 推荐结论")
            lines.append("")
            lines.append(f"- 评估对象：{verdict.get('product', '')}")
            lines.append(f"- 结论：{verdict.get('recommendation', '')}")
            if verdict.get("reason"):
                lines.append(f"- 理由：{verdict['reason']}")
            lines.append("")

        opportunities = structured_content.get("opportunities") or []
        if opportunities:
            lines.append("### 商品机会")
            lines.append("")
            for item in opportunities:
                if isinstance(item, dict):
                    lines.append(f"- {item.get('title', '')}：{item.get('reason', '')}")
            lines.append("")

        assortment = structured_content.get("assortment_plan") or {}
        if isinstance(assortment, dict) and any(assortment.values()):
            lines.append("### 商品组合")
            lines.append("")
            lines += _render_list_section("引流款", assortment.get("traffic_items") or [])
            lines += _render_list_section("利润款", assortment.get("profit_items") or [])
            lines += _render_list_section("补充款", assortment.get("filler_items") or [])

        mvt = structured_content.get("minimum_viable_test") or {}
        if isinstance(mvt, dict) and mvt.get("what_to_test"):
            lines.append("### 最小测试方案")
            lines.append("")
            lines.append(f"- 测试什么：{mvt.get('what_to_test', '')}")
            if mvt.get("quantity"):
                lines.append(f"- 测试多少：{mvt['quantity']}")
            if mvt.get("channel"):
                lines.append(f"- 测试渠道：{mvt['channel']}")
            lines.append("")

        checklist = structured_content.get("listing_checklist") or []
        if checklist:
            lines.append("### 上架准备清单")
            lines.append("")
            for item in checklist:
                if isinstance(item, dict):
                    lines.append(f"- [{item.get('status', '')}] {item.get('item', '')}")
            lines.append("")

        lines += _render_list_section(
            "供应商待确认问题", structured_content.get("supplier_questions") or []
        )
        lines += _render_list_section("下一步行动", structured_content.get("next_actions") or [])
        lines += _render_list_section("所需输入", structured_content.get("required_inputs") or [])
        lines += _render_list_section("风险提醒", structured_content.get("warnings") or [])

    else:
        for key, value in structured_content.items():
            if key == "summary":
                continue
            if isinstance(value, list):
                lines += _render_list_section(str(key), value)
            elif value:
                lines.append(f"- {key}：{value}")

    text = "\n".join(lines).strip()
    return text or "（暂无内容）"
