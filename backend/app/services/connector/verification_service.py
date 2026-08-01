"""
Verification Service —— Claude Code 执行完成后，由 backend 独立验证
结果，不采信 Claude 自己汇报的"lint 通过 / build 通过 / 页面已启动"。

所有子进程都限制在仓库目录内，且只允许 lint/build/test/开发服务器
这几个既定命令，不接受任意命令拼接。
"""

import logging
import os
import subprocess
import time

import httpx

logger = logging.getLogger("app.connector.verification")

_LINT_BUILD_TIMEOUT_SECONDS = 180
_DEV_SERVER_POLL_SECONDS = 20
_DEV_SERVER_POLL_INTERVAL = 1.0
_MAX_OUTPUT_CHARS = 1500


def _truncate(text: str) -> str:
    text = text or ""
    if len(text) <= _MAX_OUTPUT_CHARS:
        return text
    return f"…（已截断）{text[-_MAX_OUTPUT_CHARS:]}"


class VerificationService:
    @staticmethod
    def git_head(workdir: str) -> str | None:
        try:
            result = subprocess.run(
                ["git", "-C", workdir, "rev-parse", "HEAD"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode == 0:
                return result.stdout.strip()
        except OSError:
            pass
        return None

    @staticmethod
    def git_status_clean(workdir: str) -> bool:
        try:
            result = subprocess.run(
                ["git", "-C", workdir, "status", "--porcelain"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            return result.returncode == 0 and not result.stdout.strip()
        except OSError:
            return False

    @staticmethod
    def git_diff_summary(workdir: str, before_hash: str | None, after_hash: str | None) -> tuple[str, list[str]]:
        """
        返回 (diff --stat 摘要文本, 改动文件路径列表)。before/after
        任一缺失或相同则视为"没有产生新的提交"。
        """

        if not before_hash or not after_hash or before_hash == after_hash:
            return "本次执行没有产生新的提交", []

        try:
            stat_result = subprocess.run(
                ["git", "-C", workdir, "diff", "--stat", f"{before_hash}..{after_hash}"],
                capture_output=True,
                text=True,
                timeout=15,
            )
            names_result = subprocess.run(
                ["git", "-C", workdir, "diff", "--name-only", f"{before_hash}..{after_hash}"],
                capture_output=True,
                text=True,
                timeout=15,
            )
        except OSError as error:
            return f"git diff 执行失败：{type(error).__name__}", []

        files = [line.strip() for line in names_result.stdout.splitlines() if line.strip()]
        return _truncate(stat_result.stdout.strip()) or "无文件改动", files

    @staticmethod
    def run_npm_script(workdir: str, workspace: str, script: str) -> dict:
        """
        在仓库根目录以 `npm run <script> --workspace <workspace>`
        方式执行，避免子进程 cwd 直接切到子目录导致 workspace
        依赖解析失败。
        """

        try:
            result = subprocess.run(
                ["npm", "run", script, "--workspace", workspace],
                cwd=workdir,
                capture_output=True,
                text=True,
                timeout=_LINT_BUILD_TIMEOUT_SECONDS,
            )
            passed = result.returncode == 0
            output = _truncate((result.stdout or "") + "\n" + (result.stderr or ""))
            return {"ran": True, "passed": passed, "output": output.strip()}
        except subprocess.TimeoutExpired:
            return {"ran": True, "passed": False, "output": f"{script} 执行超时（超过 {_LINT_BUILD_TIMEOUT_SECONDS}s）"}
        except OSError as error:
            return {"ran": False, "passed": False, "output": f"无法执行 npm：{type(error).__name__}"}

    @staticmethod
    def has_npm_script(workdir: str, workspace_dir: str, script: str) -> bool:
        package_json_path = os.path.join(workdir, workspace_dir, "package.json")
        if not os.path.exists(package_json_path):
            return False
        try:
            import json

            with open(package_json_path, "r", encoding="utf-8") as file:
                data = json.load(file)
            return script in (data.get("scripts") or {})
        except (OSError, ValueError):
            return False

    @staticmethod
    def check_dev_server(url: str) -> dict:
        try:
            response = httpx.get(url, timeout=5.0)
            body = response.text or ""
            non_blank = len(body.strip()) > 200
            return {
                "reachable": response.status_code < 500,
                "status_code": response.status_code,
                "non_blank": non_blank,
            }
        except httpx.HTTPError:
            return {"reachable": False, "status_code": None, "non_blank": False}

    @staticmethod
    def ensure_dev_server(url: str, *, workdir: str, workspace: str) -> dict:
        """
        先检测开发服务器是否已可访问；不可访问则尝试在受控目录内
        以 `npm run dev --workspace <workspace>` 后台启动，并轮询
        直到可访问或超时。
        """

        status = VerificationService.check_dev_server(url)
        if status["reachable"]:
            return {**status, "started_by_connector": False}

        logger.info("dev server not reachable, attempting to start: %s", url)

        try:
            subprocess.Popen(
                ["npm", "run", "dev", "--workspace", workspace],
                cwd=workdir,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
        except OSError as error:
            logger.error("failed to start dev server: %s", type(error).__name__)
            return {**status, "started_by_connector": False}

        deadline = time.monotonic() + _DEV_SERVER_POLL_SECONDS
        while time.monotonic() < deadline:
            time.sleep(_DEV_SERVER_POLL_INTERVAL)
            status = VerificationService.check_dev_server(url)
            if status["reachable"]:
                return {**status, "started_by_connector": True}

        return {**status, "started_by_connector": True}
