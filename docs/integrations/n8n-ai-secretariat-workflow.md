# n8n「AI秘书处｜统一任务入口」工作流

本文档说明如何在 n8n 中导入并使用
[`automation/n8n/workflows/ai-secretariat-task-dispatch.json`](../../automation/n8n/workflows/ai-secretariat-task-dispatch.json)，
把一个 n8n Webhook 入口接到 AI-Commerce-OS 的外部任务接入网关
（[n8n-task-submit.md](n8n-task-submit.md) 中描述的
`POST /api/v1/integrations/tasks/submit`）。

**本工作流不接 DeepSeek、不接企业微信、不接抖音/1688/小红书、
不实现任务结果通知或状态查询流程**——它只做一件事：接收外部
指令、校验、转发给 AI-Commerce-OS 的任务网关，返回统一的响应。
**后端的 AgentRegistry 是唯一的 AI 员工名册**——`assigned_agent`
必须是已在 AI-Commerce-OS 后端注册的真实 Agent 名称，n8n 不维护、
不校验、不缓存任何 Agent 名单，只是原样转发这个字段。**n8n 在
这条链路里只负责接入、格式转换和连接**，不做任何业务编排、不做
任务执行、不做结果处理——真正的任务执行完全由 AI-Commerce-OS 的
RuntimeEngine/TaskConsumerService 异步完成。

## 1. 工作流作用

外部调用方（人工 curl、脚本、未来的企业微信适配层等）向 n8n 的一个
固定 Webhook URL 发送一段 JSON 指令，工作流负责：

1. 校验 Webhook 自身的 Header Authentication；
2. 对输入做标准化和安全校验（trim、长度、类型），不合规请求直接
   返回 `400`，不调用后端；
3. 固化一个稳定的 `request_id`（调用方提供就复用，没提供就用
   `n8n-{{$execution.id}}-{{$itemIndex}}` 生成，同一次
   execution 内的重试不会变化）；
4. 通过 n8n Credential 携带鉴权 Key，调用 AI-Commerce-OS 的
   外部任务网关；
5. 把后端的 202/200/401/404/422/503/500/网络失败统一映射成一套
   稳定的对外响应结构，不泄露后端原始 `detail`、SQL、堆栈、
   API Key 或任务网关内部细节。

## 2. 前置条件

- AI-Commerce-OS backend 正在运行，且已配置好
  `EXTERNAL_TASK_API_KEY`（backend 只从进程环境变量读取，
  **`.env.example` 不会被自动加载**，需要通过部署环境自身的方式
  设置）。
- n8n 实例正在运行（本文档以本地/内网自托管 n8n 2.25.7 为例）。
- assigned_agent 使用的 AI 员工名称已经在 AI-Commerce-OS
  AgentRegistry 中注册（例如 "AI CEO"）。

## 3. n8n Credentials

本工作流使用两个 **n8n Credentials**（类型均为 `HTTP Header
Auth`），真实 Key 只存在于 n8n 自身的加密凭据存储中，**不写入
workflow JSON、不写入仓库、不作为环境变量出现在容器里**：

| Credential 名称 | Header 名称 | 用途 |
| --- | --- | --- |
| `AI Commerce OS Task Gateway` | `X-Task-API-Key` | HTTP Request 节点调用后端网关时的鉴权，值必须与 backend 的 `EXTERNAL_TASK_API_KEY` 完全一致 |
| `AI Secretariat Webhook Auth` | （自定义，建议 `X-AI-Secretariat-Key`） | 保护 Webhook 入口本身，值与上面的网关 Key **完全独立、不复用** |

创建方式：n8n Web UI → Credentials → New → 选择 "Header Auth" →
填入 Header 名称和值 → 保存。保存后把这两个 Credential 分别绑定
到 "HTTP Request｜提交到 AI Commerce OS" 节点（Authentication 选
Generic Credential Type → Generic Auth Type 选 Header Auth →
选择 `AI Commerce OS Task Gateway`）和 "Webhook｜接收任务" 节点
（Authentication 选 Header Auth → 选择 `AI Secretariat Webhook
Auth`）。

## 4. 后端地址环境变量

HTTP Request 节点的目标 URL 通过 `{{$env.AI_COMMERCE_API_BASE_URL}}`
表达式读取，**不写死固定地址**：

| 变量 | 说明 | 示例 |
| --- | --- | --- |
| `AI_COMMERCE_API_BASE_URL` | AI-Commerce-OS backend 的可访问地址（不含末尾斜杠） | `http://host.docker.internal:8000` |

需要在 **n8n 自身的运行环境**中配置（Docker Compose 的
`environment:` 段、systemd `EnvironmentFile` 等），配置后需要
重启 n8n 进程才能生效。

**重要（n8n 2.x 起适用）**：较新版本的 n8n 默认**阻止** workflow
表达式访问进程环境变量（`$env.*`），需要额外设置
`N8N_BLOCK_ENV_ACCESS_IN_NODE=false` 才能让
`{{$env.AI_COMMERCE_API_BASE_URL}}` 生效，否则 HTTP Request 节点
会拿到 "access to env vars denied" 错误。这是**实例级别**的安全
权衡——会放开该实例上所有 workflow 的 `$env` 访问权限，**只在
单人本地/内网开发实例上启用，不适用于多租户或公网部署场景**。
真正敏感的凭据（网关 Key、Webhook 鉴权 Key）已经全部改用 n8n
Credentials 存储，完全不经过这个开关、也不经过 `$env` 表达式——
`AI_COMMERCE_API_BASE_URL` 本身不是 secret（只是一个可访问地址），
所以继续用 `$env` 表达式引用是可以接受的折中。

## 5. Docker 环境访问宿主机说明

如果 n8n 运行在 Docker 容器里，而 AI-Commerce-OS backend 运行在
宿主机（例如本地 `uvicorn` 直接跑在 macOS/Linux 主机上），
容器内的 n8n **不能**直接用 `localhost` 访问宿主机的
backend——`localhost` 在容器内指向容器自己，**不得**把
`http://localhost:<port>` 当作 n8n 容器访问宿主机 backend 的
地址。

- macOS / Windows（Docker Desktop）：使用
  `http://host.docker.internal:<port>` 作为
  `AI_COMMERCE_API_BASE_URL`，Docker Desktop 会自动把它解析到
  宿主机（本轮已在真实环境中验证可达）。
- Linux：`host.docker.internal` 在部分环境需要额外配置
  （`--add-host=host.docker.internal:host-gateway`），或者直接
  使用宿主机在容器所在 Docker 网络中的网关 IP。
- 如果 backend 本身也运行在同一个 docker-compose 项目里，直接用
  该服务的容器名（例如 `http://backend:8000`）通常更稳定。

## 6. 导入 workflow JSON

1. 打开 n8n Web UI；
2. 工作流列表页 → 右上角 "..." 菜单 → **Import from File**（或
   `Ctrl+O` / `Cmd+O`）；
3. 选择本仓库中的
   `automation/n8n/workflows/ai-secretariat-task-dispatch.json`；
4. 导入后会得到一个名为 **AI秘书处｜统一任务入口** 的新工作流，
   默认处于**未激活（inactive）**状态；
5. 按第 3 节说明创建并绑定两个 Credential。

导入的 JSON 中不含真实 Credential、真实 API Key、个人本地路径，
也没有写死 `localhost` 地址。

也可以用 n8n CLI 导入（适合脚本化部署）：

```bash
n8n import:workflow --input=automation/n8n/workflows/ai-secretariat-task-dispatch.json
```

## 7. Publish 与激活

n8n 2.25.7 内置"工作流版本"机制，仅仅在数据库里把 `active`
字段改成 true **不足以**让 Webhook 真正生效——正确流程：

1. 绑定好两个 Credential 后保存工作流；
2. 右上角 **Active** 开关切换为开启（Web UI 会自动处理好版本
   发布/`activeVersionId` 等内部状态）；
3. 若通过 CLI 部署，使用 `n8n publish:workflow --id=<id>`
   发布当前版本，**不要**通过直接修改数据库 `active` 字段代替
   publish；
4. 无论哪种方式，如果 n8n 进程当时正在运行，都需要**重启 n8n**
   才会真正注册 production Webhook 路由；
5. 重启前确认没有 running/waiting 的 execution，重启后确认
   webhook 已在 n8n 内部注册（生产环境可以直接发一次真实请求
   验证，返回值不是 `404 "not registered"` 即为成功）。

Webhook 的生产 URL 形如：
`http://<n8n-host>:5678/webhook/ai-secretariat/task`
（具体端口/域名取决于你的 n8n 部署方式）。

## 8. 测试命令

使用本仓库自带的验证脚本（只调用 n8n Webhook，不直接持有后端
API Key）：

```bash
N8N_TASK_WEBHOOK_URL="http://localhost:5678/webhook/ai-secretariat/task" \
N8N_WEBHOOK_AUTH_HEADER="X-AI-Secretariat-Key" \
N8N_WEBHOOK_AUTH_VALUE="<你的 Webhook 鉴权 Key>" \
  automation/n8n/scripts/verify-task-dispatch.sh
```

可选覆盖：`REQUEST_ID`、`ASSIGNED_AGENT`、`TASK_TEXT`、
`PRIORITY`。默认 `REQUEST_ID` 是固定值
`demo-verify-task-dispatch`，因此**重复运行两次**就能直接观察到
第二次返回 `duplicate=true`。脚本不会打印 `N8N_WEBHOOK_AUTH_VALUE`
的值，只会把它放进请求 Header。

也可以直接用 curl，请求体可参考
[`automation/n8n/examples/task-command.example.json`](../../automation/n8n/examples/task-command.example.json)（不含真实
Key）。

## 9. 请求字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `request_id` | 否 | 提供则 trim 后原样复用；未提供由 n8n 生成稳定值；最长 128 |
| `assigned_agent` | 是 | trim 后非空，最长 100，必须是 AgentRegistry 中已注册的真实名称 |
| `task` | 是 | trim 后 1–64 字符 |
| `priority` | 否 | `high`/`normal`/`low`，默认 `normal` |
| `context` | 否 | 必须是 JSON object，不允许 null/array/string，默认 `{}` |
| `source` | 否 | trim 后 1–50 字符，**提供了就不允许为空字符串**，未提供则默认 `n8n` |

## 10. 成功响应

首次接收（`HTTP 202`）：

```json
{
  "ok": true,
  "task_id": "TASK-...",
  "request_id": "...",
  "duplicate": false,
  "status": "pending",
  "message": "任务已进入执行队列"
}
```

## 11. 重复请求

相同 `request_id`（默认同一个 `source`）再次调用（`HTTP 200`）：

```json
{
  "ok": true,
  "task_id": "TASK-...",
  "request_id": "...",
  "duplicate": true,
  "status": "pending/running/completed/failed",
  "message": "该请求已接收，返回已有任务"
}
```

`task_id` 与首次请求完全相同，不会创建第二条任务，也不会因为
重复调用而重新执行——无论原任务当前是 pending、running、
completed 还是 failed。

## 12. 错误码

| 场景 | HTTP 状态码 | `code` |
| --- | --- | --- |
| Webhook 自身鉴权失败 | 401 或 403 | （Webhook 层面直接拒绝，不进入后续节点） |
| 输入校验失败（工作流内部拦截，未调用后端） | 400 | `INVALID_REQUEST` |
| 后端鉴权失败 | 401 | `AUTH_FAILED` |
| assigned_agent 不存在 | 404 | `AGENT_NOT_FOUND` |
| 后端字段校验失败 | 422 | `INVALID_REQUEST` |
| 后端未配置 API Key | 503 | `GATEWAY_NOT_CONFIGURED` |
| 后端 500 / 网络错误 / 超时 | 502（工作流对外统一映射） | `TEMPORARY_FAILURE` |

失败响应统一结构：

```json
{ "ok": false, "code": "...", "message": "..." }
```

不会包含后端原始 `detail`、SQL、堆栈、API Key、workflow
credentials 或请求 Header 原文。

## 13. 重试与 request_id

- **网络失败或后端 500**：可以重试，但**必须使用同一个
  `request_id`**——工作流已经在 "Code｜校验与标准化" 节点里把
  `request_id` 一次性固化，同一次 execution 内后续所有节点都
  复用这个已经固化的值，不会每次重新生成。
- **401/403（Webhook 层）/401/404/422/503（网关层）**：不代表
  "暂时性故障"，默认不建议自动重试。
- 本工作流**没有**在 HTTP Request 节点上开启 n8n 内置的 "Retry
  On Fail"——它无法区分"应该重试的 5xx/网络错误"和"不该重试的
  4xx"。真正的重试策略交给**调用方**：收到 `TEMPORARY_FAILURE`
  时，用完全相同的请求体重新调用一次 Webhook 即可，幂等保证不会
  因此产生重复任务。

## 14. Runtime stopped 行为

即使 AI-Commerce-OS 的 RuntimeEngine 当前处于 stopped 状态，
Webhook 调用仍然会正常返回 `202`，任务会保持 `pending` 排队，
**不会自动启动 Runtime**。需要管理员通过 AI-Commerce-OS
Dashboard 或 Runtime API 手动启动。

## 15. 查看任务的方法

- 直接查询：`GET /api/v1/tasks/{task_id}`（用响应体里的
  `task_id`）；
- 或在 AI-Commerce-OS 前端的**任务中心**按状态筛选/搜索，点击
  任务行可打开详情抽屉查看脱敏后的执行结果。

## 16. execution 数据安全

Webhook 触发节点会把**完整的入站请求 Header（包括 Webhook
鉴权 Header 的值）**保存进该次执行的 execution 数据里，这是 n8n
Webhook 节点的平台行为，没有内置的"排除 Header"开关。

本轮已针对 n8n 2.25.7 的真实配置项（核实自
`@n8n/config` 的 `ExecutionsConfig`，非凭记忆填写）配置了保留
策略：

```
EXECUTIONS_DATA_SAVE_ON_SUCCESS=none
EXECUTIONS_DATA_SAVE_ON_ERROR=all
EXECUTIONS_DATA_PRUNE=true
EXECUTIONS_DATA_MAX_AGE=24
```

即：成功的 execution 不保存完整数据，错误 execution 保留用于
排障，且不超过 24 小时后被自动清理。这大幅缩小了 Webhook 鉴权值
出现在 execution 数据里的时间窗口，但**不能完全消除**——错误
execution 在被清理前仍然会包含请求 Header。仍然建议：

- 不要在 Code 节点里把 `$json.headers` 原样透传给下游节点（本
  工作流的 "Code｜校验与标准化" 节点只读取 `$json.body`）；
- 定期人工检查是否有异常大量的错误 execution 堆积；
- Webhook 仅限本地/内网使用（见第 17 节），进一步降低被外部
  扫描触发大量错误 execution 的概率。

## 17. 安全注意事项

- **不要**把网关 Key 或 Webhook 鉴权 Key 直接写进 workflow 的
  节点参数或任何提交到版本库的文件——两者都通过 n8n Credentials
  存储和引用；
- `.env.example` 只是占位说明，**不会被自动加载**，需要在部署
  环境里自行配置 `EXTERNAL_TASK_API_KEY`（backend 侧）；
- 本工作流的 Webhook 入口启用了 **Header Authentication**（见
  第 3 节），但这**仍然只是应用层的一道简单保护**，不是企业级
  网关鉴权；
- 因此**不建议直接把这个 Webhook 暴露到公网**，**只建议在
  本地/内网环境使用**；
- 如果确实需要从更大的网络访问，额外套一层保护，例如：
  - Nginx 反向代理 + Basic Auth 或 IP 白名单；
  - VPN / Tailscale 等私有网络；
  - n8n 自身的用户认证（如果使用 n8n 云版或启用了
    user management）。
- 真正的公网入口保护、企业微信官方签名校验和消息加解密，
  会在下一阶段的企业微信适配中补上——**在那之前，请不要认为
  当前的 Webhook 已经具备公网生产环境的安全性**。

## 18. 本轮（阶段 7A）真实重建与验证记录

以下内容基于对本机真实 n8n 实例的一次完整重建（从 workflow=0
状态开始）、真实导入、真实 publish/激活与真实调用验证，供参考；
不包含真实 Webhook 公网地址、API Key 或 Credential ID。

- **n8n 版本**：2.25.7（自托管，Docker，PostgreSQL 持久化）。
- **实际网络访问方式**：n8n 运行在 Docker 容器中，
  AI-Commerce-OS backend 运行在宿主机，`AI_COMMERCE_API_BASE_URL`
  使用 `http://host.docker.internal:8000`，已验证真实可达。
- **是否需要容器重启**：需要。除 `N8N_BLOCK_ENV_ACCESS_IN_NODE`
  需要重启才生效之外，`publish:workflow` 本身也明确提示"如果
  n8n 正在运行，需要重启才能生效"；本轮额外发现 CLI 导入
  不会自动重新计算 `triggerCount`（内部用于判断该工作流是否有
  可注册触发器的元数据字段），需要手工核对/修正后再重启，Web UI
  的 Active 开关不会有这个问题。
- **Credentials 配置方式**：两个 `httpHeaderAuth` 类型
  Credential（见第 3 节），均通过 n8n 的凭据存储管理，未出现在
  workflow JSON 或任何文件里。
- **execution 数据安全**：已配置第 16 节所述的保留策略（本轮
  从零环境直接配置，不是"下一步待办"）。
- **真实 A–K 端到端验证**：无 Webhook Auth / 错误 Webhook
  Auth（401/403，不泄露内部信息）、Runtime stopped 首次提交
  （202/pending）、重复 request_id（200/duplicate=true）、
  Runtime start 后完整执行（pending→completed，Task Center 和
  详情抽屉均可查看）、completed 后重复请求（不重新执行）、8 种
  非法输入（均 400，不建任务）、不存在 Agent（404）、错误网关
  Key（401，测试后已恢复正确 Credential）、backend 不可达
  （TEMPORARY_FAILURE，恢复后同一 request_id 重试成功）、日志与
  execution 安全扫描（未发现任何真实 Key/密码/连接串/traceback）
  均已通过。
- **本轮修复的一个真实 bug**：`source` 字段传入空字符串时，
  早期实现会静默把它当作"未提供"处理并回退成默认值 `n8n`（视为
  合法请求），而不是按规范拒绝为 `400 INVALID_REQUEST`。已在
  "Code｜校验与标准化" 节点中修正为：字段存在但 trim 后为空时
  明确拒绝，只有字段完全未提供（`undefined`/`null`）时才使用
  默认值，并已在离线单元验证和真实 Webhook 请求两个层面复核。

## 19. 下一步：企业微信适配位置

本轮工作流的 Webhook 入口设计为"通用指令接收器"，字段命名
（`assigned_agent`/`task`/`context`/`priority`/`source`）与
底层的外部任务网关请求体保持一致，因此下一阶段接入企业微信时，
预期的改动范围是：

- 在 **"Webhook｜接收任务"** 节点之前新增企业微信回调签名
  校验和消息体解密节点；
- 在 **"Code｜校验与标准化"** 节点之前（或之内）新增
  "企业微信消息 → 本工作流标准输入格式"的转换逻辑，把企业微信
  的原始消息结构转换成本文档第 9 节描述的标准字段；
- 复用本工作流从 "IF｜请求是否合法" 开始的全部后续节点
  （校验、request_id 固化、调用网关、响应映射）不做改动。

不在本轮实现范围内。
