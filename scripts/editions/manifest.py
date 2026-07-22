"""
ADR-0002 Edition Boundary — 构建清单（Phase 0 脚手架）。

只是数据，不含任何检查逻辑（检查逻辑见 check_boundary.py）：每个
Edition 的客户发行包"应该包含哪些前端源码目录"、"绝对不能包含
哪些目录"。

现状：系统只有一个共享 backend 进程，Edition 由运行时环境变量
EDITION 区分（见 backend/app/core/edition.py 的 require_edition()
依赖），还没有按 Edition 分别打包 backend 的机制，所以这里只对
frontend 建立 include/exclude 清单。backend 侧"不得把测试/迁移/
Git 信息打进客户发行包"的规则记在 UNIVERSAL_FORBIDDEN_PREFIXES
里，对所有 Edition 都适用，与前端 include 清单无关；backend 路由
在各 Edition 下是否可达，由 backend/tests/test_edition_boundary.py
针对真实运行时行为做验证，这份清单不重复建模。
"""

# 对所有客户发行包（operator / device-admin）都禁止出现的路径
# 前缀（以 "/" 结尾）或精确文件名（不以 "/" 结尾），不区分 Edition。
UNIVERSAL_FORBIDDEN_PREFIXES = (
    ".git/",
    "backend/tests/",
    "backend/migrations/",
    "backend/.venv/",
    "frontend/node_modules/",
    "docs/",
    "automation/",
    "CHANGELOG.md",
    "README.md",
)

# 文件名子串：无论出现在哪个目录，命中即视为测试文件，禁止出现在
# 任何客户发行包里。
UNIVERSAL_FORBIDDEN_FILENAME_SUBSTRINGS = (
    "test_",  # backend: test_*.py
    ".test.js",  # frontend: *.test.js / *.test.jsx
)

# 目前有真实专属前端源码的 Edition 只有 operator（复用
# frontend/src/operator-preview/ 原型，见 ADR-0002）。device-admin
# 还没有专属前端（ADR-0002 Migration Plan Phase 2），include 留空
# ——check_boundary.py 对空 include 视为"尚未构建"，跳过而不是报错。
# frontend/src/main.jsx 故意不在任何 Edition 的 include 里：它是
# 当前唯一的共享入口文件，运行时根据 getActiveEdition() 在 App 和
# OperatorPreviewApp 之间选择——今天两个分支都会被 Vite 打进同一个
# dist/ 产物（还没有按 Edition 拆分构建产物），所以 main.jsx 本身
# 必然同时 import developer 和 operator 两侧的入口组件，这是 Core
# 引导代码的正常形态，不代表 operator 发行包"引用了 developer-only
# 模块"。真正的按 Edition 拆分入口、产出独立 dist/，是 ADR-0002
# Migration Plan Phase 3 的工作，不在这一轮范围内。
FRONTEND_INCLUDE_PREFIXES = {
    "operator": (
        "frontend/src/editions/",
        "frontend/src/operator-preview/",
        "frontend/src/index.css",
        "frontend/src/styles/",
    ),
    "device-admin": (),
}

# 明确禁止出现在该 Edition 发行包里的前端目录/文件。即使有人以后
# 不小心把某个 Edition 的 include 前缀写得过宽（比如指向了
# frontend/src 根目录），这里也会在自洽性检查阶段挡住。
FRONTEND_FORBIDDEN_PREFIXES = {
    "operator": (
        "frontend/src/pages/",
        "frontend/src/App.jsx",
        "frontend/src/App.css",
        "frontend/src/components/tasks/",
        "frontend/src/components/runtime/",
    ),
    "device-admin": (
        "frontend/src/pages/",
        "frontend/src/App.jsx",
        "frontend/src/App.css",
        "frontend/src/components/tasks/",
        "frontend/src/components/runtime/",
        "frontend/src/operator-preview/",
    ),
}

EDITIONS = tuple(FRONTEND_INCLUDE_PREFIXES.keys())
