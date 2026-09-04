# AI Commerce OS Local Runtime V1

AI Commerce OS 本地运行只有两种互斥模式，并共享同一组 server command。

## Canonical ports and commands

- Frontend: `127.0.0.1:5173`，由 `scripts/frontend-server` 启动，Vite `strictPort` 禁止漂移。
- Backend: `127.0.0.1:8000`，唯一命令入口为 `scripts/backend-server`，实际执行 `backend/.venv/bin/python -m uvicorn app.main:app`。
- PostgreSQL: `127.0.0.1:5432`。Redis 当前不是 Founder V1 启动硬依赖。

Codex 和开发者不得另起临时 `uvicorn` 或 `npm run dev`；调试启动脚本本身除外。

## Development Mode

```bash
./scripts/dev-start
./scripts/dev-status
./scripts/dev-restart
./scripts/dev-stop
./scripts/dev-logs
```

Development Mode 使用临时 user launchd jobs，Backend 启用 reload。`dev-start` 会暂停 Resident Mode、清理旧 bootstrap jobs、执行 Alembic upgrade、验证 `/health` 与 Frontend HTTP 200。重复 start 不创建第二套进程。

## Resident Mode

```bash
./scripts/resident-start
./scripts/resident-restart
./scripts/resident-stop
```

Resident Mode 安装两个最小 LaunchAgent 到 `~/Library/LaunchAgents`：

- `com.sinofut.ai-commerce-os.backend`
- `com.sinofut.ai-commerce-os.frontend`

它们使用绝对项目路径、明确 WorkingDirectory、固定日志，并在 Mac 用户登录时 RunAtLoad。Resident 与 Development 不会同时占用端口。

## Health, state and logs

`GET http://127.0.0.1:8000/health` 同时验证应用、数据库连接和 Alembic head。Frontend 必须真实返回 HTTP 200。运行状态在 `.runtime/local-runtime/`，日志统一位于：

- `.runtime/logs/backend.log`
- `.runtime/logs/frontend.log`
- `.runtime/logs/bootstrap.log`

`.runtime/` 已被 Git 忽略。

## Troubleshooting

- `dev-status` 报 Backend stopped：运行 `./scripts/dev-restart`，再看 backend log。
- 5173/8000 被其他应用占用：启动会明确报 PID 并停止，不会自动换端口。
- Migration 未到 head：启动在 Backend 前执行现有 Alembic migration；失败时 Backend 不启动。
- 切换 Resident → Development：直接运行 `dev-start`。
- 恢复 Resident：先 `dev-stop`，再运行 `resident-start`。

Founder 日常只需记住：`./scripts/dev-start`。

## Deferred UX / IA backlog

后续处理 Founder Lifecycle 开发入口、能力资产模板命名、System Builder 关系、Legacy Execution、低对比度、测试会话清理、模块职责梳理、Learning 智能化与真实 Execution 闭环；Local Runtime V1 不修改这些产品页面。
