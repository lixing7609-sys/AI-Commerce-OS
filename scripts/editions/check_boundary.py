#!/usr/bin/env python3
"""
ADR-0002 Edition Boundary 检查器（Phase 0 脚手架）。

用法：
    python3 scripts/editions/check_boundary.py --edition operator
    python3 scripts/editions/check_boundary.py --edition device-admin
    python3 scripts/editions/check_boundary.py                # 全部 Edition（默认）
    python3 scripts/editions/check_boundary.py --edition all  # 等价写法

只依赖标准库和本地 git 可执行文件，不需要安装任何依赖，可以随时
在本地或未来的 CI 里运行。

做三件事（都基于 manifest.py 里的静态清单，不需要真正的打包
流水线存在）：
  1. 清单自洽性——每个 Edition 的 include 前缀不能和它自己的
     forbidden 前缀、也不能和全局 UNIVERSAL_FORBIDDEN_PREFIXES
     重叠；
  2. 把清单套用到 `git ls-files` 的真实文件列表上，解析出"这个
     Edition 目前会包含哪些文件"，确认里面不会出现测试/迁移/
     Git 信息等禁止内容；
  3. 对解析出的前端源码文件做 import 边界检查：不允许它们
     import 到本 Edition 明确禁止的目录（例如 operator 不能
     import frontend/src/pages 或 frontend/src/components/tasks）
     ——这是"防止 Edition 只靠菜单隐藏、代码里其实还连着
     developer-only 模块"的直接证据，而不是停留在 UI 层面。

这一版不会、也不需要生成真正的客户发行包（还没有 Docker / 打包
流水线，见 ADR-0002 Build Boundary 一节），只验证"如果照这份清单
打包，结果是安全的"。
"""

import argparse
import re
import subprocess
import sys
from pathlib import Path

import manifest

REPO_ROOT = Path(__file__).resolve().parents[2]

_IMPORT_PATTERN = re.compile(
    r"""(?:from\s+|import\s*\()\s*["'](?P<spec>\.[^"']+)["']"""
)


def _git_ls_files() -> list[str]:
    result = subprocess.run(
        ["git", "ls-files"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return [line for line in result.stdout.splitlines() if line]


def _matches_any_prefix(path: str, prefixes) -> bool:
    for prefix in prefixes:
        if prefix.endswith("/"):
            if path.startswith(prefix):
                return True
        elif path == prefix:
            return True
    return False


def _is_universally_forbidden(path: str) -> bool:
    if _matches_any_prefix(path, manifest.UNIVERSAL_FORBIDDEN_PREFIXES):
        return True

    filename = Path(path).name
    return any(
        substring in filename
        for substring in manifest.UNIVERSAL_FORBIDDEN_FILENAME_SUBSTRINGS
    )


def check_manifest_self_consistency(edition: str) -> list[str]:
    errors = []
    include = manifest.FRONTEND_INCLUDE_PREFIXES[edition]
    forbidden = manifest.FRONTEND_FORBIDDEN_PREFIXES[edition]

    for inc in include:
        if _matches_any_prefix(inc, forbidden):
            errors.append(
                f"[{edition}] manifest 定义冲突：include 前缀 {inc!r} "
                f"命中了同一 Edition 的 forbidden 前缀"
            )

        if _is_universally_forbidden(inc):
            errors.append(
                f"[{edition}] manifest 定义冲突：include 前缀 {inc!r} "
                f"命中了 UNIVERSAL_FORBIDDEN_PREFIXES"
            )

    return errors


def resolve_edition_files(edition: str, all_files: list[str]) -> list[str]:
    """
    模拟"如果现在按这份清单给这个 Edition 打包，会包含哪些文件"。

    纯字符串匹配，不要求文件真实存在，方便测试用假文件列表调用。
    """

    include = manifest.FRONTEND_INCLUDE_PREFIXES[edition]
    forbidden = manifest.FRONTEND_FORBIDDEN_PREFIXES[edition]

    resolved = []
    for path in all_files:
        if not _matches_any_prefix(path, include):
            continue
        if _matches_any_prefix(path, forbidden):
            continue
        resolved.append(path)

    return resolved


def check_no_forbidden_files_resolved(
    edition: str, all_files: list[str]
) -> list[str]:
    errors = []

    for path in resolve_edition_files(edition, all_files):
        if _is_universally_forbidden(path):
            errors.append(f"[{edition}] 禁止内容混入客户发行包：{path}")

    return errors


def check_import_boundary(edition: str, all_files: list[str]) -> list[str]:
    errors = []
    forbidden = manifest.FRONTEND_FORBIDDEN_PREFIXES[edition]

    for path in resolve_edition_files(edition, all_files):
        if not (path.endswith(".js") or path.endswith(".jsx")):
            continue

        file_path = REPO_ROOT / path

        try:
            content = file_path.read_text(encoding="utf-8")
        except OSError:
            continue

        for match in _IMPORT_PATTERN.finditer(content):
            spec = match.group("spec")
            resolved_import = (file_path.parent / spec).resolve()

            try:
                relative_import = resolved_import.relative_to(REPO_ROOT).as_posix()
            except ValueError:
                continue

            if _matches_any_prefix(relative_import, forbidden):
                errors.append(
                    f"[{edition}] {path} import 了 developer-only 模块："
                    f"{spec!r} -> {relative_import}"
                )

    return errors


def run_checks(edition: str, all_files: list[str]) -> list[str]:
    errors = check_manifest_self_consistency(edition)

    if not manifest.FRONTEND_INCLUDE_PREFIXES[edition]:
        # 这个 Edition 还没有专属前端源码（例如 device-admin，见
        # ADR-0002 Migration Plan Phase 2），没有文件可检查，不算
        # 失败。
        return errors

    errors += check_no_forbidden_files_resolved(edition, all_files)
    errors += check_import_boundary(edition, all_files)
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--edition",
        choices=[*manifest.EDITIONS, "all"],
        default="all",
    )
    args = parser.parse_args()

    all_files = _git_ls_files()
    editions_to_check = (
        manifest.EDITIONS if args.edition == "all" else (args.edition,)
    )

    all_errors = []
    for edition in editions_to_check:
        errors = run_checks(edition, all_files)

        if errors:
            all_errors.extend(errors)
        else:
            resolved_count = len(resolve_edition_files(edition, all_files))
            print(f"[{edition}] OK（{resolved_count} 个文件纳入清单，未发现越界）")

    if all_errors:
        print("\nEdition boundary check FAILED:", file=sys.stderr)
        for error in all_errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
