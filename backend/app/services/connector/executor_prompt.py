"""
把批准后的结构化任务包（Task Package）渲染成发给 Claude Code CLI 的
Prompt，而不是把整段聊天原文丢过去。
"""

_RESULT_CONTRACT = """你现在以非交互（headless）方式运行，没有人可以在执行过程中回答你的追问，所以你必须遵守下面这个严格的"结束方式"约定，否则你的输出无法被上游系统正确解析：

1. 如果任务要求清晰、你可以独立完成：正常使用 Read/Edit/Write/Grep/Glob 以及被允许的 Bash 命令完成开发，完成后你的最后一条消息必须且只能是下面这种格式（不要有多余的开场白）：

EXECUTION_SUMMARY_JSON:
{"summary": "一句话说明做了什么", "files_changed": ["改动的文件路径"], "known_issues": "已知问题，没有则填“无”", "commit_message": "本次提交使用的 git commit message"}

并且你必须在结束前用 git 提交你的改动（git add + git commit），不要用 --amend。

2. 如果任务要求存在歧义、你无法确定用户真实意图、必须先得到澄清才能继续：不要猜测、不要动手改代码，最后一条消息必须且只能是：

CLARIFICATION_NEEDED: <这里写清楚、具体的一个问题>

3. 如果任务过程中出现以下情况——需要删除大量文件、需要做架构级改动、涉及数据库结构变更、需要安装项目当前未使用过的新依赖、涉及生产部署、需要发送任何外部消息、会产生费用、或者需要访问本项目工作目录之外的内容——一律不要执行，最后一条消息必须且只能是：

AUTHORIZATION_NEEDED: <这里写清楚你想做什么、为什么需要额外授权>

4. 普通的代码修改、lint、build、本地测试、启动本地开发服务器可以在你当前被允许的工具范围内直接执行，不需要为此触发 AUTHORIZATION_NEEDED。

5. 你只能在当前工作目录内操作，不允许访问或修改这个目录之外的任何内容。"""


def build_system_contract() -> str:
    return _RESULT_CONTRACT


def build_initial_prompt(task_package: dict) -> str:
    def _join(items):
        items = items or []
        return "；".join(str(i) for i in items) if items else "无"

    lines = [
        f"# 开发任务：{task_package.get('name', '未命名任务')}",
        "",
        f"## 背景\n{task_package.get('background', '（无）')}",
        f"## 当前遗留问题\n{task_package.get('currentProblem', '无')}",
        f"## 已确认结论（必须遵守，作为验收依据）\n{_join(task_package.get('confirmedConclusions'))}",
        f"## 已否决方案（不要重新采用）\n{_join(task_package.get('rejectedApproaches'))}",
        f"## 禁止事项（关键约束，绝不能违反）\n{_join(task_package.get('prohibitions'))}",
        f"## 执行范围\n{task_package.get('scope', '（未指定，请谨慎评估影响范围）')}",
        f"## UI 参考\n{task_package.get('uiReference', '（无特殊要求）')}",
        f"## 代码影响范围\n{task_package.get('codeImpact', '（未指定）')}",
        f"## 验收标准\n{_join(task_package.get('acceptanceCriteria'))}",
        f"## 测试要求\n{task_package.get('testRequirements', '（未指定）')}",
        f"## 页面查看要求\n{task_package.get('pageViewRequirement', '（未指定）')}",
        f"## Git 要求\n{task_package.get('gitRequirement', '创建新 commit，不使用 --amend')}",
        "",
        "请直接开始，遵守你在系统提示里收到的结束方式约定。",
    ]
    return "\n\n".join(lines)


def build_resume_prompt(answer: str, *, kind: str) -> str:
    if kind == "authorization":
        return (
            f"用户对你之前提出的授权请求的回复：{answer}\n\n"
            "如果用户同意，请继续执行对应操作；如果用户不同意或要求调整，请改用其它方式达成目标或再次说明。"
            "完成后仍然必须遵守系统提示里的结束方式约定（EXECUTION_SUMMARY_JSON / "
            "CLARIFICATION_NEEDED / AUTHORIZATION_NEEDED 三选一）。"
        )
    return (
        f"用户对你之前提出的澄清问题的回答：{answer}\n\n"
        "请基于这个回答继续完成任务，完成后仍然必须遵守系统提示里的结束方式约定"
        "（EXECUTION_SUMMARY_JSON / CLARIFICATION_NEEDED / AUTHORIZATION_NEEDED 三选一）。"
    )
