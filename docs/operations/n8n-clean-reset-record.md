# n8n 清场记录

本文档只记录清理操作的时间、清理前后数量和结论，不包含任何
secret、Credential ID、Webhook 地址或数据库密码。

## 清理时间

2026-07-19（UTC 08:20 前后开始，同日完成）。

## 背景

前序阶段（6C）发现本机 n8n 实例上 9 个活跃业务 workflow 共享同一
枚已泄露的 DeepSeek API Key。用户确认：本机 n8n 中的全部旧
workflow 均无真实生产使用，无需备份 workflow JSON、Credential
内容或数据库，可直接删除后重建。本轮据此执行彻底清场，不重建新
workflow。

## 清理前数量

- n8n 版本：2.25.7
- workflow 总数：18（active 11 / inactive 7）
- execution 总数：24（running/waiting：0）
- webhook registration 数量：5
- credential 总数：2

## 清理操作

- 在单个数据库事务内删除全部 workflow（级联清理
  execution/webhook/shared_workflow/workflow_history/
  workflow_statistics 等关联记录）与全部 credential（级联清理
  credential_dependency 等关联记录），事务提交前逐表核对了外键
  关系，未使用 DROP TABLE，未触碰 migrations/user/project/role/
  settings 等系统表，未触碰 n8n encryption key 文件。
- 清除了 n8n 容器 `docker-compose.yml` 中与旧业务集成相关的环境
  变量配置（后端网关地址/Key、DeepSeek Key、以及为支持
  `$env.*` 表达式访问而临时开启的开关），恢复为仅含数据库连接、
  时区、CORS 的基础配置。
- 只重启了 n8n 容器；PostgreSQL、Ollama、AI-Commerce-OS backend
  均未重启、未受影响。

## 清理后数量

- workflow 总数：0（active 0 / inactive 0）
- execution 总数：0（running/waiting：0）
- webhook registration 数量：0
- credential 总数：0
- 系统表（migrations/user/project/role/settings）行数与清理前
  完全一致。

## 结论

n8n 实例已恢复为干净状态，可供下一轮从零开始重新搭建自动化
workflow。AI-Commerce-OS backend/frontend 未受本次操作影响
（pytest 全量通过，alembic 版本不变，Dashboard/Task Center 手工
验证正常）。原先泄露的 DeepSeek Key **仍需用户在 DeepSeek 控制台
主动吊销**——本次清场只是移除了 n8n 中的引用，不等同于凭据本身
已失效。
