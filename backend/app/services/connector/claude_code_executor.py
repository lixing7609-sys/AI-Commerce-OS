"""
Claude Code Executor —— Executor Adapter 分层里"真正把批准后的任务
交给 Claude Code CLI 执行"的模块。

复用本机已登录的 Claude Code CLI（不在项目内保存任何凭证），限制在
仓库工作目录内，用 --allowed-tools 白名单把 Bash 收窄到 lint/build/
test/dev-server/git 这几类安全命令；任何超出范围的操作会被 Claude
Code 自身的权限系统拒绝，模型据此在最终消息里返回
AUTHORIZATION_NEEDED，由 Sino 转发给用户请求额外授权。

一次任务包只允许有一个进行中的 executor run（并发保护），生命周期
running -> waiting_for_input（可反复，通过 --resume 续传）->
completed / failed / cancelled，全部落库到 ConnectorRunDB，重启
backend 不会丢失执行历史（但进程本身不能跨重启恢复，重启后残留的
running 状态会在下次查询时被判定为异常并提示用户）。
"""

import asyncio
import json
import logging
import re
import uuid

from app.services.connector.connector_run_service import ConnectorRunService
from app.services.connector.credential_service import CredentialService
from app.services.connector.executor_prompt import (
    build_initial_prompt,
    build_resume_prompt,
    build_system_contract,
)
from app.services.connector.screenshot_service import ScreenshotError, ScreenshotService
from app.services.connector.verification_service import VerificationService
from app.core.config import get_founder_dev_server_url

logger = logging.getLogger("app.connector.executor")

_ALLOWED_TOOLS = [
    "Read",
    "Edit",
    "Write",
    "Grep",
    "Glob",
    "Bash(git status*)",
    "Bash(git diff*)",
    "Bash(git add*)",
    "Bash(git commit*)",
    "Bash(git log*)",
    "Bash(git rev-parse*)",
    "Bash(npm run lint*)",
    "Bash(npm run build*)",
    "Bash(npm test*)",
    "Bash(npm run dev*)",
]

_FOUNDER_WORKSPACE = "apps/founder"
_FOUNDER_WORKSPACE_DIR = "apps/founder"

_SUMMARY_MARKER = re.compile(r"EXECUTION_SUMMARY_JSON:\s*(\{.*\})", re.DOTALL)
_CLARIFICATION_MARKER = re.compile(r"CLARIFICATION_NEEDED:\s*(.+)", re.DOTALL)
_AUTHORIZATION_MARKER = re.compile(r"AUTHORIZATION_NEEDED:\s*(.+)", re.DOTALL)


class ExecutionAlreadyRunningError(Exception):
    def __init__(self, existing_run_id: str):
        self.existing_run_id = existing_run_id
        super().__init__(f"task package already has an active run: {existing_run_id}")


class ExecutorNotAvailableError(Exception):
    pass


class ClaudeCodeExecutor:
    _active_processes: dict[str, asyncio.subprocess.Process] = {}

    # ------------------------------------------------------------------
    # 公开入口
    # ------------------------------------------------------------------

    @classmethod
    async def start_execution(
        cls,
        *,
        conversation_id: str,
        decision_id: str | None,
        task_package_id: str,
        task_package: dict,
    ) -> str:
        health = CredentialService.check_executor_health()
        if not health["ready"]:
            raise ExecutorNotAvailableError(health.get("issue") or "executor_not_ready")

        existing = ConnectorRunService.find_active_run_for_task_package(task_package_id)
        if existing is not None:
            raise ExecutionAlreadyRunningError(existing.id)

        config = CredentialService.get_executor_config()
        before_hash = VerificationService.git_head(config.workdir)
        session_id = str(uuid.uuid4())

        run = ConnectorRunService.start_run(
            kind="executor",
            conversation_id=conversation_id,
            decision_id=decision_id,
            task_package_id=task_package_id,
            input_summary=f"task={task_package.get('name')}",
            status="running",
            detail={
                "task_package": task_package,
                "current_step": "准备启动 Claude Code",
                "awaiting_input_question": None,
                "awaiting_input_kind": None,
                "claude_session_id": session_id,
                "before_commit_hash": before_hash,
                "log_tail": [],
            },
        )

        prompt = build_initial_prompt(task_package)
        asyncio.create_task(cls._run(run.id, prompt, session_id=session_id, resume=False))
        return run.id

    @classmethod
    async def provide_input(cls, run_id: str, answer: str) -> None:
        run = ConnectorRunService.get_run(run_id)
        if run is None:
            raise ValueError("run not found")
        if run.status != "waiting_for_input":
            raise ValueError(f"run is not waiting for input (status={run.status})")

        detail = run.detail or {}
        session_id = detail.get("claude_session_id")
        kind = detail.get("awaiting_input_kind") or "clarification"

        ConnectorRunService.update_run(
            run_id,
            status="running",
            detail={"current_step": "已收到回答，继续执行", "awaiting_input_question": None},
        )

        prompt = build_resume_prompt(answer, kind=kind)
        asyncio.create_task(cls._run(run_id, prompt, session_id=session_id, resume=True))

    @classmethod
    async def cancel(cls, run_id: str) -> None:
        process = cls._active_processes.get(run_id)
        if process is not None and process.returncode is None:
            process.terminate()
        ConnectorRunService.complete_run(run_id, status="cancelled", output_summary="用户已取消执行")

    # ------------------------------------------------------------------
    # 内部执行循环
    # ------------------------------------------------------------------

    @classmethod
    async def _run(cls, run_id: str, prompt: str, *, session_id: str, resume: bool) -> None:
        config = CredentialService.get_executor_config()
        args = [
            config.cli_path,
            "-p",
            prompt,
            "--append-system-prompt",
            build_system_contract(),
            "--output-format",
            "stream-json",
            "--verbose",
            "--permission-mode",
            "acceptEdits",
            "--allowed-tools",
            *_ALLOWED_TOOLS,
            "--add-dir",
            config.workdir,
            "--session-id" if not resume else "--resume",
            session_id,
        ]
        if config.model:
            args += ["--model", config.model]

        logger.info("executor spawning claude cli: run_id=%s resume=%s", run_id, resume)

        try:
            process = await asyncio.create_subprocess_exec(
                *args,
                cwd=config.workdir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except OSError as error:
            logger.error("failed to spawn claude cli: %s", type(error).__name__)
            ConnectorRunService.complete_run(
                run_id, status="failed", error=f"无法启动 Claude Code CLI（{type(error).__name__}）"
            )
            return

        cls._active_processes[run_id] = process
        final_text: str | None = None
        is_error = False
        log_tail: list[str] = []

        try:
            async for raw_line in process.stdout:
                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line:
                    continue
                event = cls._safe_json(line)
                if event is None:
                    continue

                step = cls._describe_event(event)
                if step:
                    log_tail.append(step)
                    log_tail = log_tail[-30:]
                    ConnectorRunService.update_run(
                        run_id, detail={"current_step": step, "log_tail": log_tail}
                    )

                if event.get("type") == "result":
                    is_error = bool(event.get("is_error"))
                    final_text = event.get("result")

            await asyncio.wait_for(process.wait(), timeout=config.timeout_seconds)
        except asyncio.TimeoutError:
            process.kill()
            ConnectorRunService.complete_run(
                run_id, status="failed", error="执行超时，已终止 Claude Code 进程"
            )
            cls._active_processes.pop(run_id, None)
            return
        finally:
            cls._active_processes.pop(run_id, None)

        if final_text is None:
            stderr_bytes = await process.stderr.read()
            stderr_text = stderr_bytes.decode("utf-8", errors="replace")[-1500:]
            ConnectorRunService.complete_run(
                run_id,
                status="failed",
                error=f"Claude Code 未返回可解析的结果（退出码 {process.returncode}）",
                detail={"stderr_tail": stderr_text},
            )
            return

        await cls._handle_final_text(run_id, final_text, is_error=is_error)

    @staticmethod
    def _safe_json(line: str) -> dict | None:
        try:
            return json.loads(line)
        except json.JSONDecodeError:
            return None

    @staticmethod
    def _describe_event(event: dict) -> str | None:
        event_type = event.get("type")
        if event_type == "assistant":
            message = event.get("message") or {}
            for block in message.get("content") or []:
                if block.get("type") == "tool_use":
                    name = block.get("name", "工具")
                    target = (block.get("input") or {}).get("file_path") or (block.get("input") or {}).get(
                        "command"
                    )
                    return f"调用 {name}" + (f"：{str(target)[:80]}" if target else "")
                if block.get("type") == "text" and block.get("text", "").strip():
                    return block["text"].strip()[:120]
        if event_type == "system" and event.get("subtype") == "init":
            return "Claude Code 会话已启动"
        return None

    @classmethod
    async def _handle_final_text(cls, run_id: str, final_text: str, *, is_error: bool) -> None:
        summary_match = _SUMMARY_MARKER.search(final_text)
        clarification_match = _CLARIFICATION_MARKER.search(final_text)
        authorization_match = _AUTHORIZATION_MARKER.search(final_text)

        if clarification_match and not summary_match:
            question = clarification_match.group(1).strip()
            ConnectorRunService.update_run(
                run_id,
                status="waiting_for_input",
                detail={
                    "current_step": "等待用户澄清",
                    "awaiting_input_question": question,
                    "awaiting_input_kind": "clarification",
                },
            )
            return

        if authorization_match and not summary_match:
            question = authorization_match.group(1).strip()
            ConnectorRunService.update_run(
                run_id,
                status="waiting_for_input",
                detail={
                    "current_step": "等待用户额外授权",
                    "awaiting_input_question": question,
                    "awaiting_input_kind": "authorization",
                },
            )
            return

        if is_error and not summary_match:
            ConnectorRunService.complete_run(
                run_id, status="failed", error=final_text[:2000] or "Claude Code 执行失败"
            )
            return

        summary_payload = {}
        if summary_match:
            try:
                summary_payload = json.loads(summary_match.group(1))
            except json.JSONDecodeError:
                summary_payload = {}

        await cls._verify_and_finalize(run_id, final_text, summary_payload)

    @classmethod
    async def _verify_and_finalize(cls, run_id: str, final_text: str, summary_payload: dict) -> None:
        run = ConnectorRunService.get_run(run_id)
        detail = run.detail or {}
        config = CredentialService.get_executor_config()
        before_hash = detail.get("before_commit_hash")

        loop = asyncio.get_event_loop()

        after_hash = await loop.run_in_executor(None, VerificationService.git_head, config.workdir)
        diff_summary, files_changed = await loop.run_in_executor(
            None, VerificationService.git_diff_summary, config.workdir, before_hash, after_hash
        )

        lint_result = {"ran": False, "passed": None, "output": "跳过（未检测到 lint 脚本）"}
        if await loop.run_in_executor(
            None, VerificationService.has_npm_script, config.workdir, _FOUNDER_WORKSPACE_DIR, "lint"
        ):
            lint_result = await loop.run_in_executor(
                None, VerificationService.run_npm_script, config.workdir, _FOUNDER_WORKSPACE, "lint"
            )

        build_result = {"ran": False, "passed": None, "output": "跳过（未检测到 build 脚本）"}
        if await loop.run_in_executor(
            None, VerificationService.has_npm_script, config.workdir, _FOUNDER_WORKSPACE_DIR, "build"
        ):
            build_result = await loop.run_in_executor(
                None, VerificationService.run_npm_script, config.workdir, _FOUNDER_WORKSPACE, "build"
            )

        test_result = {"ran": False, "passed": None, "output": "项目未配置自动化测试脚本，本次仅凭浏览器验证"}
        if await loop.run_in_executor(
            None, VerificationService.has_npm_script, config.workdir, _FOUNDER_WORKSPACE_DIR, "test"
        ):
            test_result = await loop.run_in_executor(
                None, VerificationService.run_npm_script, config.workdir, _FOUNDER_WORKSPACE, "test"
            )

        dev_server_url = get_founder_dev_server_url()
        dev_status = await loop.run_in_executor(
            None,
            lambda: VerificationService.ensure_dev_server(
                dev_server_url, workdir=config.workdir, workspace=_FOUNDER_WORKSPACE
            ),
        )

        page_ok = bool(dev_status.get("reachable") and dev_status.get("non_blank"))

        screenshot_path = None
        screenshot_error = None
        if page_ok:
            try:
                screenshot_path = await loop.run_in_executor(
                    None, ScreenshotService.capture, dev_server_url, run_id
                )
            except ScreenshotError as error:
                screenshot_error = str(error)

        known_issues = str(summary_payload.get("known_issues") or "").strip()
        if not page_ok:
            known_issues = (known_issues + "；" if known_issues else "") + "开发服务器不可访问或页面为空，未通过自动验证"
        if screenshot_error:
            known_issues = (known_issues + "；" if known_issues else "") + f"截图失败：{screenshot_error}"

        final_detail = {
            "current_step": "已完成，等待验收" if page_ok else "验证未通过",
            "summary": str(summary_payload.get("summary") or final_text[:500]).strip(),
            "files_changed": files_changed or summary_payload.get("files_changed") or [],
            "git_diff_summary": diff_summary,
            "commit_hash": after_hash if after_hash != before_hash else None,
            "lint_result": lint_result,
            "build_result": build_result,
            "test_result": test_result,
            "dev_server_url": dev_server_url,
            "dev_server_status": dev_status,
            "screenshot_path": screenshot_path,
            "known_issues": known_issues or "无",
            "awaiting_input_question": None,
            "awaiting_input_kind": None,
        }

        status = "completed" if page_ok else "failed"
        ConnectorRunService.complete_run(
            run_id,
            status=status,
            output_summary=final_detail["summary"],
            error=None if page_ok else "页面未通过自动验证，未标记为完成",
            detail=final_detail,
        )
