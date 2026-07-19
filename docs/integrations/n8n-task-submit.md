# n8n 任务提交集成指南

本文档说明如何在 n8n 中通过 HTTP Request 节点调用
AI-Commerce-OS 的外部任务接入网关
`POST /api/v1/integrations/tasks/submit`，把任务提交给 AI 员工
异步执行。本接口专为 n8n 等外部系统设计，后续也会用于企业微信等
其它外部入口的接入（本轮不实现企业微信本身）。

## 1. 环境变量配置

后端通过环境变量 `EXTERNAL_TASK_API_KEY` 读取鉴权 Key，只从进程
环境变量读取，不会自动加载 `.env` 文件（本项目当前没有 dotenv
加载机制），需要通过部署环境自身的方式设置，例如：

```bash
export EXTERNAL_TASK_API_KEY="<在此填入实际使用的 Key>"
```

参考占位文件：[`backend/.env.example`](../../backend/.env.example)。

**Key 未配置时**，接口会对所有请求返回 `503`，不会区分"没配置"
和"配错了"这两种情况，也不会在响应或日志中暴露具体原因。

**请勿**把真实 Key 提交到代码仓库，也不要在 n8n workflow 的
JSON 导出文件中直接硬编码 Key——建议使用 n8n 自身的 Credentials
或环境变量机制注入。

## 2. HTTP Request 节点配置

在 n8n 中新建一个 **HTTP Request** 节点，按下表配置：

| 配置项 | 值 |
| --- | --- |
| Method | `POST` |
| URL | `http://<backend-host>:<port>/api/v1/integrations/tasks/submit` |
| Authentication | None（Key 通过自定义 Header 传递，见下） |
| Headers | `Content-Type: application/json`、`X-Task-API-Key: <你的 Key>` |
| Body Content Type | JSON |
| Body | 见下方"JSON Body 示例" |

## 3. request_id 建议生成方式

`request_id` 是本接口的幂等键，与 `source` 联合唯一——**相同
`(source, request_id)` 组合的重复提交不会创建新任务，也不会
重新执行**，而是直接返回已有任务的当前状态。

推荐使用 n8n 内置的执行编号 `{{$execution.id}}`，如果同一次
执行内会提交多条任务，再拼接 `{{$itemIndex}}` 避免同一次执行内
的多个 item 互相冲突：

```json
{
  "request_id": "{{$execution.id}}-{{$itemIndex}}",
  "source": "n8n",
  "assigned_agent": "AI CEO",
  "task": "生成今日经营分析",
  "context": {},
  "priority": "normal"
}
```

字段约束：

| 字段 | 约束 |
| --- | --- |
| `request_id` | 去除首尾空白后 1–128 字符 |
| `source` | 去除首尾空白后 1–50 字符，本文档场景固定填 `n8n` |
| `assigned_agent` | 去除首尾空白后 1–100 字符，必须是已在系统中注册的 AI 员工名称 |
| `task` | 去除首尾空白后 1–64 字符 |
| `context` | 必须是 JSON object（`{}` 也可以），不接受数组/字符串/null |
| `priority` | `high` / `normal` / `low`，默认 `normal` |

**注意**：若 `context` 中包含 `task` 这个 key，会被顶层 `task`
字段覆盖，实际执行时以顶层 `task` 为准。

## 4. 首次提交：202 示例

首次提交（`(source, request_id)` 组合此前不存在）返回
`HTTP 202`：

```json
{
  "id": "TASK-0AB05ACA5ECE",
  "request_id": "n8n-20260719-000001",
  "source": "n8n",
  "status": "pending",
  "assigned_agent": "AI CEO",
  "task_type": "生成今日经营分析",
  "priority": "normal",
  "created_at": "2026-07-19T06:07:52.089186Z",
  "duplicate": false,
  "message": "任务已进入执行队列"
}
```

`status` 恒为 `pending`（本接口只入队，不等待执行完成）。

## 5. 重复提交：200 + duplicate=true 示例

相同 `(source, request_id)` 再次提交，返回 `HTTP 200`，
`duplicate=true`，`id` 与首次提交完全相同，`status` 反映该任务
**当前**的真实状态（可能已经是 `running`/`completed`/`failed`）：

```json
{
  "id": "TASK-0AB05ACA5ECE",
  "request_id": "n8n-20260719-000001",
  "source": "n8n",
  "status": "completed",
  "assigned_agent": "AI CEO",
  "task_type": "生成今日经营分析",
  "priority": "normal",
  "created_at": "2026-07-19T06:07:52.089186Z",
  "duplicate": true,
  "message": "该请求已接收，返回已有任务"
}
```

不会创建第二条任务，也不会因为重复提交而重新执行——无论原任务
当前是 `pending`、`running`、`completed` 还是 `failed`，均不会
自动重跑或重新排队。

## 6. 错误处理

| HTTP 状态码 | 触发场景 | n8n 侧建议处理 |
| --- | --- | --- |
| `401` | 未携带 `X-Task-API-Key`，或 Key 不正确 | 检查 Header 配置和 Key 是否正确；不要在 workflow 里明文回显返回的 `detail` |
| `404` | `assigned_agent` 未在系统中注册 | 检查 Agent 名称拼写；不要自动重试（Agent 不存在不会因为重试而出现） |
| `422` | 请求体字段校验失败（如 `task` 超过 64 字符、`priority` 不是 high/normal/low、`context` 不是 JSON object） | 修正请求体后再提交；使用原 `request_id` 重新提交是安全的，因为失败的请求从未成功创建过任务 |
| `500` | 服务端内部错误（数据库异常等） | 可以重试，但**必须使用同一个 `request_id`**（见下），不要生成新的 |
| `503` | 服务端未配置 `EXTERNAL_TASK_API_KEY` | 联系后端管理员配置环境变量；重试无意义，需要先修复配置 |

## 7. Runtime stopped 时仍会正常排队

即使 AI-Commerce-OS 的 RuntimeEngine 当前处于 stopped 状态，本
接口仍然会正常接受任务、返回 `202`，任务会保持 `pending` 状态
排队等待，**不会自动启动 Runtime**。需要由系统管理员手动启动
Runtime，或等待其本来就处于运行中时被后台任务消费者拾取执行。

## 8. 重要：不要在 n8n 中因超时盲目生成新 request_id 重试

如果 HTTP Request 节点因为网络问题或后端处理较慢而超时，
**不要**在重试逻辑里重新生成一个新的 `request_id`（例如重新调用
`{{$execution.id}}` 或额外拼接时间戳）——这样做会绕开幂等保护，
可能导致同一个业务操作被提交为两条完全独立的任务。

正确做法：**重试时必须沿用与首次请求完全相同的
`request_id`**。由于幂等去重，即使首次请求实际上已经在服务端
成功创建了任务（只是响应因为网络原因没有送达 n8n），重试也只会
拿回同一条已有任务的当前状态（`duplicate=true`），不会产生
重复任务。

一种简单可靠的做法是：在 workflow 中把 `request_id` 计算为一个
独立的 Set 节点输出（例如基于 `{{$execution.id}}` 和
`{{$itemIndex}}`），让重试分支复用同一个 Set 节点的输出，而不是
在每次 HTTP Request 尝试时重新计算。
