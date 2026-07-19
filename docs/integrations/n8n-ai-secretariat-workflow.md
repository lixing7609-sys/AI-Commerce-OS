# n8n「AI秘书处 - 任务接收与分发」工作流

本文档说明如何在 n8n 中导入并使用
[`automation/n8n/workflows/ai-secretariat-task-dispatch.json`](../../automation/n8n/workflows/ai-secretariat-task-dispatch.json)，
把一个 n8n Webhook 入口接到 AI-Commerce-OS 的外部任务接入网关
（[n8n-task-submit.md](n8n-task-submit.md) 中描述的
`POST /api/v1/integrations/tasks/submit`）。

**本轮不接企业微信官方回调签名，不处理企业微信加解密**——本工作流
只提供一个通用的、任何调用方都能用的 Webhook 指令入口；企业微信
适配是下一阶段的独立工作（见第 17 节）。

## 1. 工作流作用

外部调用方（人工 curl、脚本、未来的企业微信适配层等）向 n8n 的一个
固定 Webhook URL 发送一段 JSON 指令，工作流负责：

1. 接收请求；
2. 对输入做标准化和安全校验（trim、长度、类型），不合规请求直接
   返回 `400`，不调用后端；
3. 固化一个稳定的 `request_id`（调用方提供就复用，没提供就用
   `n8n-{{$execution.id}}-{{$itemIndex}}` 生成，同一次
   execution 内的重试不会变化）；
4. 调用 AI-Commerce-OS 的外部任务网关，携带 API Key；
5. 把后端的 202/200/401/404/422/503/500/网络失败统一映射成一套
   稳定的对外响应结构，不泄露后端原始 `detail`、SQL、堆栈、
   API Key 或任务网关内部细节。

工作流本身**不等待任务执行完成**——它只负责把任务安全地送进
AI-Commerce-OS 的任务队列，Agent 的实际执行由 AI-Commerce-OS 后台
的 RuntimeEngine/TaskConsumerService 异步完成。

## 2. 前置条件

- AI-Commerce-OS backend 正在运行，且已按
  [n8n-task-submit.md](n8n-task-submit.md) 配置好
  `EXTERNAL_TASK_API_KEY`（backend 只从进程环境变量读取，
  **`.env.example` 不会被自动加载**，需要通过部署环境自身的方式
  设置）。
- n8n 实例正在运行（本文档以本地/内网自托管 n8n 为例）。
- assigned_agent 使用的 AI 员工名称已经在 AI-Commerce-OS 中注册
  （例如 "AI CEO"）。

## 3. n8n 环境变量

工作流的 HTTP Request 节点通过 `$env` 表达式读取以下两个变量，
**不会把真实值写进 workflow JSON 本身**：

| 变量 | 说明 | 示例 |
| --- | --- | --- |
| `AI_COMMERCE_API_BASE_URL` | AI-Commerce-OS backend 的可访问地址（不含末尾斜杠） | `http://host.docker.internal:8000` |
| `AI_COMMERCE_TASK_API_KEY` | 与 backend `EXTERNAL_TASK_API_KEY` 完全一致的值 | （只在部署环境中配置，不写入任何文档或代码） |

这两个变量需要在 **n8n 自身的运行环境**中配置（例如 Docker
Compose 的 `environment:` 段、systemd `EnvironmentFile`、或
n8n 自托管服务器的 shell 环境），配置后通常需要重启 n8n 进程才能
生效——这是 n8n 读取 `$env.*` 的固有机制，不是本工作流引入的
限制。**不要**把这两个值直接粘贴进 workflow 的节点参数里。

**重要（n8n 2.x 起适用）**：较新版本的 n8n 默认**阻止**
workflow 表达式访问进程环境变量（`$env.*`），需要额外设置
`N8N_BLOCK_ENV_ACCESS_IN_NODE=false` 才能让本工作流的
`{{$env.AI_COMMERCE_API_BASE_URL}}` / `{{$env.AI_COMMERCE_TASK_API_KEY}}`
表达式生效，否则 HTTP Request 节点会拿到
"access to env vars denied" 错误，被统一映射成
`TEMPORARY_FAILURE`（看起来像网络故障，实际是权限限制）。这是
**实例级别**的设置，会放开该实例上*所有* workflow 的 `$env`
访问权限——如果你的 n8n 实例有多个互不信任的 workflow 作者，请
改用 n8n 的 Variables 功能（`$vars.*`，逐条配置、不受此开关
影响）代替 `$env.*`。本仓库交付的 workflow JSON 按 `$env.*`
设计，是否放开该开关由你根据自己实例的信任模型决定。

## 4. Docker 环境访问宿主机说明

如果 n8n 运行在 Docker 容器里，而 AI-Commerce-OS backend 运行在
宿主机（例如本地 `uvicorn` 直接跑在 macOS/Linux 主机上），
容器内的 n8n 不能直接用 `localhost` 访问宿主机的 backend——
`localhost` 在容器内指向容器自己。

- macOS / Windows（Docker Desktop）：使用
  `http://host.docker.internal:<port>` 作为
  `AI_COMMERCE_API_BASE_URL`，Docker Desktop 会自动把它解析到
  宿主机。
- Linux：`host.docker.internal` 在部分环境需要额外配置
  （`--add-host=host.docker.internal:host-gateway`），或者直接
  使用宿主机在容器所在 Docker 网络中的网关 IP。
- 如果 backend 本身也运行在同一个 docker-compose 项目里，直接用
  该服务的容器名（例如 `http://backend:8000`）通常更稳定。

## 5. 导入 workflow JSON

1. 打开 n8n Web UI；
2. 工作流列表页 → 右上角 "..." 菜单 → **Import from File**（或
   `Ctrl+O` / `Cmd+O`）；
3. 选择本仓库中的
   `automation/n8n/workflows/ai-secretariat-task-dispatch.json`；
4. 导入后会得到一个名为 **AI秘书处 - 任务接收与分发** 的新工作流，
   默认处于**未激活（inactive）**状态。

导入的 JSON 中不含真实 Credential、真实 API Key、个人本地路径，
也没有写死 `localhost` 地址——鉴权和后端地址均通过第 3 节的环境
变量注入。

也可以用 n8n CLI 导入（适合脚本化部署）：

```bash
n8n import:workflow --input=automation/n8n/workflows/ai-secretariat-task-dispatch.json
```

## 6. 激活 Webhook

配置好第 3 节的环境变量、重启 n8n 后：

1. 打开导入的工作流；
2. **建议先配置 Webhook 节点的 Header Authentication**（见第 16
   节"安全注意事项"），再激活；
3. 右上角 **Active** 开关切换为开启；
4. Webhook 的生产 URL 形如：
   `http://<n8n-host>:5678/webhook/ai-secretariat/task`
   （具体端口/域名取决于你的 n8n 部署方式）。

通过 n8n **Web UI** 的 Active 开关激活，会由 n8n 自身完成全部
必要的内部登记（包括较新版本里"工作流版本"机制要求的当前版本
必须被标记为已发布版本，以及 Webhook 路由表的登记）——这是通过
UI 激活相比脚本化操作更可靠的原因，本文档不假设你会用数据库或
CLI 直接拼装这些内部状态。若你通过 CLI 批量部署，请在激活后用
一次真实的 Webhook 调用验证是否生效（返回非 `404 "not
registered"` 才算成功），而不是只检查工作流列表里的 Active
状态。

## 7. 测试命令

使用本仓库自带的验证脚本（只调用 n8n Webhook，不直接持有后端
API Key）：

```bash
N8N_TASK_WEBHOOK_URL="http://localhost:5678/webhook/ai-secretariat/task" \
  automation/n8n/scripts/verify-task-dispatch.sh
```

可选覆盖：`REQUEST_ID`、`ASSIGNED_AGENT`、`TASK_TEXT`、
`PRIORITY`。默认 `REQUEST_ID` 是固定值
`demo-verify-task-dispatch`，因此**重复运行两次**就能直接观察到
第二次返回 `duplicate=true`。

也可以直接用 curl，请求体可参考
[`automation/n8n/examples/task-command.example.json`](../../automation/n8n/examples/task-command.example.json)（不含真实
Key）：

```bash
curl -X POST http://localhost:5678/webhook/ai-secretariat/task \
  -H "Content-Type: application/json" \
  -d @automation/n8n/examples/task-command.example.json
```

## 8. 请求字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `request_id` | 否 | 提供则 trim 后原样复用；未提供由 n8n 生成稳定值 |
| `assigned_agent` | 是 | trim 后非空，最长 100 字符 |
| `task` | 是 | trim 后 1–64 字符 |
| `priority` | 否 | `high`/`normal`/`low`，默认 `normal` |
| `context` | 否 | 必须是 JSON object，默认 `{}` |
| `source` | 否 | trim 后 1–50 字符，默认 `n8n` |

## 9. 成功响应

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

## 10. 重复请求

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

## 11. 错误码

| 场景 | HTTP 状态码 | `code` |
| --- | --- | --- |
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

## 12. 重试与 request_id

- **网络失败或后端 500**：可以重试，但**必须使用同一个
  `request_id`**——工作流已经在 "Code - Normalize and Validate"
  节点里把 `request_id` 一次性固化进标准化对象，同一次
  execution 内后续所有节点（包括 HTTP Request 节点自身可能的
  重试）都复用这个已经固化的值，不会每次重新生成。
- **401/404/422/503**：不代表"暂时性故障"，默认不建议自动重试
  （鉴权错误、Agent 不存在、请求格式错误、网关未配置，重试也不会
  变成功）。
- 本工作流**没有**在 HTTP Request 节点上开启 n8n 内置的
  "Retry On Fail"——因为该机制无法区分"应该重试的 5xx/网络错误"
  和"不该重试的 4xx"，会对所有失败一视同仁地重试。真正的重试
  策略交给**调用方**：收到 `TEMPORARY_FAILURE` 时，用完全相同的
  请求体（尤其是相同的 `request_id`）重新调用一次 Webhook 即可，
  幂等保证不会因此产生重复任务。
- 调用方**不应该**在没有收到任何响应（超时）时就假设任务没有被
  创建——很可能任务已经在后端成功创建，只是响应没有送达。正确
  做法始终是：用同一个 `request_id` 重新调用，依赖幂等去重拿回
  已有任务的真实状态。

## 13. Runtime stopped 行为

即使 AI-Commerce-OS 的 RuntimeEngine 当前处于 stopped 状态，
Webhook 调用仍然会正常返回 `202`，任务会保持 `pending` 排队，
**不会自动启动 Runtime**。需要管理员通过 AI-Commerce-OS
Dashboard 或 Runtime API 手动启动。

## 14. 查看任务的方法

- 直接查询：`GET /api/v1/tasks/{task_id}`（用响应体里的
  `task_id`）；
- 或在 AI-Commerce-OS 前端的**任务中心**按状态筛选/搜索。

## 15. Dashboard / Task Center 验证

1. 打开 AI-Commerce-OS 前端 Dashboard；
2. 切换到"任务中心"；
3. 用返回的 `task_id` 定位对应任务行，确认状态随 Runtime
   启动/consumer 轮询正确从 `pending` 变为
   `running`/`completed`；
4. 点击任务行可打开任务详情抽屉，查看脱敏后的执行结果。

## 16. 安全注意事项

- **不要**把 `AI_COMMERCE_TASK_API_KEY` 直接写进 workflow 的
  节点参数或任何提交到版本库的文件——只通过 n8n 自身的环境变量
  注入；
- **不要**把任何第三方 API Key（例如 DeepSeek）直接硬编码进
  HTTP Request 节点的 Header/Body 参数——优先使用 n8n
  **Credentials**（例如 `httpHeaderAuth`、或节点自带的专用凭据
  类型），节点类型不支持 Credentials 时才退而求其次使用
  `{{$env.YOUR_KEY_NAME}}` 表达式，两种方式都绝不能是明文写死；
- `.env.example` 只是占位说明，**不会被自动加载**，需要在部署
  环境里自行配置对应的环境变量；
- 建议给 Webhook 节点启用 **Header Authentication**（n8n 内置
  能力，节点参数设 `authentication: headerAuth`，具体 Header
  名称/值通过 n8n Credentials 配置，不写进 workflow JSON）——
  本仓库交付的 JSON 已经默认开启这个开关，但**不包含**任何具体
  凭据引用，需要你导入后自行在 n8n UI 里创建/绑定一个
  `Header Auth` 类型的 Credential；
- 即使启用了 Header Authentication，本工作流的 Webhook **仍然
  只适合本地/内网使用**——它本身不做企业微信官方签名校验、不做
  消息体加解密、不做速率限制；
- 因此**不建议直接把这个 Webhook 暴露到公网**；
- 建议只在**本地/内网**环境运行，或者在暴露给更大网络之前，
  额外套一层保护，例如：
  - Nginx 反向代理 + Basic Auth 或 IP 白名单；
  - VPN / Tailscale 等私有网络；
  - n8n 自身的用户认证（如果使用 n8n 云版或启用了
    user management）。
- 真正的公网入口保护、企业微信官方签名校验和消息加解密，
  会在下一阶段的企业微信适配中补上——**在那之前，请不要认为
  当前的 Webhook 已经具备公网生产环境的安全性**。

## 17. 下一步：企业微信适配位置

本轮工作流的 Webhook 入口设计为"通用指令接收器"，字段命名
（`assigned_agent`/`task`/`context`/`priority`/`source`）与
底层的外部任务网关请求体保持一致，因此下一阶段接入企业微信时，
预期的改动范围是：

- 在 **"Webhook - Receive Task"** 节点之前新增企业微信回调签名
  校验和消息体解密节点；
- 在 **"Code - Normalize and Validate"** 节点之前（或之内）新增
  "企业微信消息 → 本工作流标准输入格式"的转换逻辑，把企业微信
  的原始消息结构转换成本文档第 8 节描述的标准字段；
- 复用本工作流从 "IF - Validation Passed" 开始的全部后续节点
  （校验、request_id 固化、调用网关、响应映射）不做改动。

不在本轮实现范围内。

## 18. 本轮（阶段 6C）真实端到端激活验证记录

以下内容基于对本机真实 n8n 实例的一次实际导入、激活与调用验证，
供参考；不包含真实 Webhook 公网地址、API Key 或 Credential ID。

**n8n 版本**：2.25.7（自托管，Docker，PostgreSQL 持久化）。

**实际网络访问方式**：n8n 运行在 Docker 容器中，
AI-Commerce-OS backend 运行在宿主机（非容器化的 `uvicorn`），
`AI_COMMERCE_API_BASE_URL` 使用
`http://host.docker.internal:8000`——已验证容器可正常访问宿主机
该端口。

**是否需要容器重启**：需要，且不止一次。除第 3 节已说明的
"配置 `$env.*` 需要重启才生效"之外，本轮额外发现：较新版本
n8n 内部有一套"工作流版本"机制（`versionId` /
`activeVersionId` / `triggerCount` 等内部字段），仅仅把
`active` 置为 true 并不足以让 Webhook 真正生效，还需要该工作流
的"当前版本"被正确标记为"已发布版本"，且需要重启进程才会重新
注册 Webhook 路由。**这正是为什么第 6 节建议优先通过 n8n Web
UI 的 Active 开关来激活**——UI 会替你处理好这些内部状态，避免
手工拼装导致 Webhook 看起来"已激活"但实际返回
`404 "not registered"`。

**Webhook 保护方式**：Header Authentication（n8n 内置能力），
Header 名称和值通过 n8n Credentials（`httpHeaderAuth` 类型）
配置，未写入 workflow JSON 或本仓库任何文件。

**Credentials 配置方式**：本轮额外发现该 n8n 实例上已存在一个
类型为 `deepSeekApi` 的 Credential（"DeepSeek account"）——本轮
未读取、未展示、未修改其内容（读取会显示明文，出于安全考虑
主动避免）；已处置的多个 workflow 中被禁用的 DeepSeek 调用节点，
建议你在拿到新 Key 后，优先更新这个已存在的 Credential（而不是
重新硬编码），再把对应节点的 Authentication 方式从"无"改为
"Predefined Credential Type: DeepSeek"，最后重新启用该节点。

**execution 数据安全建议**：Webhook 触发节点会把**完整的入站
请求 Header（包括你配置的 Header Auth 值）**保存进该次执行的
execution 数据里，这是 n8n Webhook 节点的平台行为，没有内置的
"排除 Header"开关。建议：

- 缩短 execution 数据保留时间（`EXECUTIONS_DATA_MAX_AGE`，单位
  小时）或关闭成功 execution 的完整数据保存
  （`EXECUTIONS_DATA_SAVE_ON_SUCCESS=none`）——这是**实例级别**
  设置，会影响所有 workflow，请自行评估是否会影响你依赖执行
  历史排障的其它 workflow，本轮未替你启用；
- 定期清理不再需要的 execution 历史，尤其是用于验证/联调目的的
  测试执行；
- 不要在 Code 节点里主动把 Header 原样透传进后续节点的输出（本
  工作流的 "Code - Normalize and Validate" 节点只读取
  `$json.body`，不读取、不透传 `$json.headers`）。

**明文 Key 禁止项**（本轮强制执行的规则，适用于本仓库和你自己
维护的 n8n 实例）：

- 不得在任何 workflow 节点参数里出现 `Bearer sk-...` 或其它
  明文 API Key 字符串；
- 不得在 Git 仓库的任何文件里出现真实 API Key、真实 Webhook
  公网地址或真实 Credential ID；
- 不得在终端输出、日志、AI 助手的回复或任何调试信息中打印真实
  Key；
- 第三方厂商 Key（例如 DeepSeek）泄露后，正确处置顺序永远是：
  先在厂商控制台吊销/轮换旧 Key，再配置新 Key，而不是"先把旧
  Key 藏起来"——旧 Key 只要还有效，就仍然是一个真实的风险。
