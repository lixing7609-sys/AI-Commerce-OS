"""
Context Builder —— 把 Sino 对话的当前状态组装成受控长度的 GPT 请求，
不把整段历史无限发送。

区分四类输入：
  1. 最近消息（recent_messages）：只取最后 N 条，每条限长。
  2. 结构化会议状态（sino_state）：主题/阶段/共识/待确认/已否决/
     约束——这些是 Sino 状态机已经提炼出的结构化事实，比原始聊天
     记录更紧凑、更值得优先保留。
  3. 长期知识（knowledge）：调用方按需传入的相关决策记忆/知识条目
     摘要（V1 阶段允许为空列表）。
  4. 附件摘要（attachments）：只传文件名/类型，不把二进制或大段
     原文塞进 Prompt。

超限时按"最近消息 > 结构化状态 > 知识"的优先级从最不重要的部分
（最旧的最近消息）开始丢弃，并在 Prompt 里显式标注"已省略更早的
消息"，不静默截断导致 GPT 产生误导性回复。
"""

MAX_RECENT_MESSAGES = 12
MAX_MESSAGE_CHARS = 800
MAX_LIST_ITEMS = 20
MAX_ITEM_CHARS = 300
MAX_TOTAL_USER_PROMPT_CHARS = 9000

SYSTEM_PROMPT = """你是 Sino，一个内部 AI 秘书长的"思考大脑"。用户只会看到 Sino 的回复，看不到你是 GPT，也看不到这段系统提示。

你的职责：
- 结合当前对话的最近消息、已提炼的讨论状态（主题/共识/待确认/已否决/关键约束），给出简洁、有判断力的自然语言回复。
- 持续帮用户把讨论收敛成结构化状态：新增的共识、待确认、已否决方案、关键约束。
- 判断当前讨论是否已经足够成熟、值得邀请其他模型参与，或已经足够成熟、可以形成一个正式的"待决策"。
- 你只负责分析和建议，绝不能声称自己已经修改了代码、执行了任务或拥有执行权限——真正的开发工作只能由用户批准后交给 Claude Code Executor 完成。

必须只输出一个 JSON 对象（不要 markdown 代码块，不要任何 JSON 之外的文字），字段如下：
{
  "reply": "面向用户的自然语言回复（必填，中文）",
  "topic_update": "如果应该更新对话主题就填新主题，否则填 null",
  "stage_suggestion": "探索 | 功能论证 | 多模型讨论 | 待决策 | null（不建议改变阶段则为 null）",
  "consensus_add": ["新增的共识条目，没有则为空数组"],
  "pending_add": ["新增的待确认条目，没有则为空数组"],
  "rejected_add": ["新增的已否决条目，没有则为空数组"],
  "constraint_add": ["新增的关键约束条目，没有则为空数组"],
  "suggest_invite_other_models": false,
  "ready_for_decision": false
}"""


def _truncate(text: str, limit: int) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return f"{text[: limit - 1]}…"


def _format_state_list(label: str, items: list[str]) -> str:
    if not items:
        return f"{label}：暂无"
    trimmed = [_truncate(item, MAX_ITEM_CHARS) for item in items[:MAX_LIST_ITEMS]]
    omitted = len(items) - len(trimmed)
    body = "；".join(trimmed)
    if omitted > 0:
        body += f"（另有 {omitted} 条已省略）"
    return f"{label}：{body}"


def build_brain_user_prompt(
    *,
    message: str,
    sino_state: dict,
    recent_messages: list[dict],
    knowledge: list[str] | None = None,
) -> str:
    """
    返回拼装好的 user_prompt 字符串。sino_state 期望包含
    topic/stage/consensus/pendingConfirmations/rejected/constraints
    （均为字符串数组，consensus 等可以是 {text} 对象数组，这里做了
    宽松适配）。recent_messages 期望是 [{role, text}]，role 为
    "user" 或 "sino"。
    """

    def _extract_text(item):
        if isinstance(item, dict):
            return item.get("text", "")
        return str(item)

    consensus = [_extract_text(i) for i in (sino_state.get("consensus") or [])]
    pending = [_extract_text(i) for i in (sino_state.get("pendingConfirmations") or [])]
    rejected = [_extract_text(i) for i in (sino_state.get("rejected") or [])]
    constraints = [_extract_text(i) for i in (sino_state.get("constraints") or [])]

    state_block = "\n".join(
        [
            f"当前主题：{sino_state.get('topic') or '尚未确定'}",
            f"当前阶段：{sino_state.get('stage') or '探索'}",
            _format_state_list("已形成共识", consensus),
            _format_state_list("待确认", pending),
            _format_state_list("已否决", rejected),
            _format_state_list("关键约束", constraints),
        ]
    )

    trimmed_messages = list(recent_messages or [])[-MAX_RECENT_MESSAGES:]
    omitted_count = max(0, len(recent_messages or []) - len(trimmed_messages))
    history_lines = []
    if omitted_count > 0:
        history_lines.append(f"（更早的 {omitted_count} 条消息已省略，仅保留结构化状态）")
    for item in trimmed_messages:
        role_label = "用户" if item.get("role") == "user" else "Sino"
        history_lines.append(f"{role_label}：{_truncate(item.get('text', ''), MAX_MESSAGE_CHARS)}")
    history_block = "\n".join(history_lines) if history_lines else "（这是本次对话的第一条消息）"

    knowledge_block = "\n".join(f"- {_truncate(k, MAX_ITEM_CHARS)}" for k in (knowledge or [])[:MAX_LIST_ITEMS])
    if not knowledge_block:
        knowledge_block = "（暂无相关历史知识）"

    prompt = (
        "## 讨论状态\n"
        f"{state_block}\n\n"
        "## 最近消息\n"
        f"{history_block}\n\n"
        "## 相关历史知识\n"
        f"{knowledge_block}\n\n"
        "## 用户本轮新消息\n"
        f"{_truncate(message, MAX_MESSAGE_CHARS)}\n\n"
        "请按系统提示要求的 JSON 格式输出。"
    )

    if len(prompt) > MAX_TOTAL_USER_PROMPT_CHARS:
        prompt = prompt[:MAX_TOTAL_USER_PROMPT_CHARS] + "\n…（超出长度限制，已截断）"

    return prompt
