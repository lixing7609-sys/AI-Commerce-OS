# 企业微信 × AI秘书处 集成指南

本文档说明如何把企业微信自建应用接入 AI-Commerce-OS 的
"AI秘书处"体系，实现"发消息给企业微信应用 → AI 员工执行任务 →
企业微信收到结果"的双向指令闭环。**不包含任何真实 Corp ID、
Secret、Token、EncodingAESKey 或真实 Webhook 公网地址**——这些
必须由你自己在企业微信管理后台生成，并只写入本机安全环境或
n8n Credentials。

## 1. 架构图

```
企业微信客户端
      │  发送消息 / 接收回复
      ▼
企业微信服务器
      │  GET  一次性 URL 校验
      │  POST 加密消息回调（5 秒超时）
      ▼
AI-Commerce-OS backend
  GET/POST /api/v1/integrations/wecom/callback
      │  验签（msg_signature）
      │  AES-256-CBC 解密（EncodingAESKey）
      │  提取 发送人 / MsgId / 文本内容
      │  固化幂等 request_id
      ▼  同步 HTTP 调用（Header Auth Credential）
n8n「AI秘书处｜企业微信指令入口」workflow
      │  确定性正则解析指令类型（提交 / 查询 / 无法识别）
      ▼
      ├─→ HTTP Request → POST /api/v1/integrations/tasks/submit
      │     （AI-Commerce-OS 外部任务网关，阶段 6A/6C）
      │
      └─→ HTTP Request → GET /api/v1/integrations/tasks/{task_id}
            （AI-Commerce-OS 安全查询接口，阶段 7B 新增）
      │
      ▼  格式化 reply_text
AI-Commerce-OS backend
      │  把 reply_text 包装成企业微信消息 XML 并 AES 加密
      ▼
企业微信服务器 → 企业微信客户端（收到回复）
```

**为什么密码学逻辑放在 backend，而不是 n8n Code 节点**：验签和
AES 解密适合用后端单元测试覆盖各种边界情况（签名篡改、CorpID
不匹配、密文损坏等）；n8n 在这条链路里只负责**接入**（Webhook
收消息）、**转换**（把自由文本指令转换成结构化的提交/查询参数、
把接口响应转换成人类可读的回复文案）和**连接**（把 backend 的
消息入口、任务提交网关、任务查询接口这几个独立能力串起来），不
掺杂密码学细节，也更容易审计。

**职责边界（贯穿全文）**：

- **AI-Commerce-OS backend**：唯一负责企业微信消息的验签、解密、
  加密回复；不解析指令类型、不判断"提交"还是"查询"。
- **n8n workflow**：唯一负责指令类型判断、调用哪个 AI-Commerce-OS
  接口、组织回复文案；不做密码学、不直接执行 Agent、不在自己内部
  保存任务状态。
- **AI-Commerce-OS 的 AgentRegistry 是唯一的 AI 员工名册**——不
  论是 backend 还是 n8n，都不维护第二份"合法员工名单"；
  `assigned_agent` 是否真实存在，完全由任务提交网关在真正提交时
  校验并返回 404。

## 2. 企业微信后台配置（需要你完成）

以下步骤必须由你在企业微信管理后台（work.weixin.qq.com）完成，
**任何一步都不需要、也不应该把 Secret/Token/AESKey 发给
AI 助手**：

1. 登录企业微信管理后台，进入"应用管理" → 创建一个自建应用；
2. 记录该应用的 **AgentId**（页面上直接可见）；
3. 记录企业的 **CorpID**（"我的企业" 页面可见）；
4. 在应用详情页生成/查看 **Secret**（点击"查看"需要管理员扫码）；
5. 在应用详情页找到"接收消息" → 配置：
   - 设置 API 接收 **URL**（见第 4 节，格式类似
     `https://<你的域名>/api/v1/integrations/wecom/callback`，
     **必须是 HTTPS**，企业微信不接受明文 HTTP 回调）；
   - 生成 **Token**（点击"随机获取"）；
   - 生成 **EncodingAESKey**（点击"随机获取"，43 位字符串）；
6. 点击"保存"——企业微信会立即发起一次 **GET URL 校验**请求，
   backend 必须已经用正确的 Token/EncodingAESKey 部署并可公网
   访问，才能保存成功；
7. 在"企业可信 IP"（如果开启了该限制）中加入你的 backend 出口 IP；
8. 把 CorpID / AgentId / Secret / Token / EncodingAESKey 这 5 项
   写入本机 `backend/.env`（见第 3 节），**不要**粘贴到聊天、
   文档、commit message 或任何提交到仓库的文件里。

## 3. Credential 配置

### 3.1 backend 侧（企业微信自建应用凭据）

写入 `backend/.env`（600 权限，已被 `.gitignore` 排除）：

```
WECOM_CORP_ID=
WECOM_AGENT_ID=
WECOM_APP_SECRET=
WECOM_CALLBACK_TOKEN=
WECOM_ENCODING_AES_KEY=
```

5 项必须同时配置；backend 只从进程环境变量读取，不会自动加载
`.env` 文件（本项目当前没有 dotenv 加载机制），需要通过
`set -a; source backend/.env; set +a` 或部署环境自身的方式注入。
任一缺失时，`/api/v1/integrations/wecom/callback` 会对所有请求
返回 `503`。

### 3.2 backend → n8n（企业微信指令入口 Webhook 鉴权）

backend 需要知道如何调用 n8n 的
"AI秘书处｜企业微信指令入口" Webhook：

```
WECOM_N8N_WEBHOOK_URL=
WECOM_N8N_WEBHOOK_AUTH_HEADER=
WECOM_N8N_WEBHOOK_AUTH_VALUE=
```

`WECOM_N8N_WEBHOOK_AUTH_VALUE` 的值必须与 n8n 里
"AI Secretariat WeCom Command Auth" Credential 的值完全一致。

### 3.3 n8n 侧（4 个 Header Auth 类型 Credential）

| Credential 名称 | 保护对象 | 说明 |
| --- | --- | --- |
| `AI Commerce OS Task Gateway`（阶段 7A 已创建，本轮复用） | HTTP Request 节点调用后端任务提交/查询接口 | 值 = backend `EXTERNAL_TASK_API_KEY` |
| `AI Secretariat Webhook Auth`（阶段 7A 已创建） | "AI秘书处｜统一任务入口" 的 Webhook | 与企业微信无关 |
| `AI Secretariat WeCom Command Auth`（本轮新增） | "AI秘书处｜企业微信指令入口" 的 Webhook | 只允许被 backend 调用，不面向外部用户 |
| `AI Secretariat Task Query Auth`（本轮新增） | "AI秘书处｜任务状态查询" 的 Webhook | 独立、可复用的查询能力入口 |

均通过 n8n Web UI → Credentials → New → Header Auth 创建，值均为
随机生成的高强度字符串，不写入 workflow JSON、不写入仓库。

## 4. 回调 URL 与 HTTPS 要求

企业微信**只接受 HTTPS 回调 URL**，且证书必须是受信任 CA 签发
（自签名证书不被接受）。本地开发环境（`http://localhost:8000`）
**无法**直接作为企业微信回调 URL 使用，必须：

- 部署到有公网 HTTPS 域名的环境，或
- 使用内网穿透工具（如 ngrok、frp）临时获得一个 HTTPS 公网地址
  仅用于开发调试，调试结束后立即关闭。

回调 URL 路径固定为：`/api/v1/integrations/wecom/callback`（GET
和 POST 复用同一路径，企业微信通过 HTTP method 区分）。

## 5. URL 验证

企业微信保存回调配置时会发起一次性 GET 请求：

```
GET /api/v1/integrations/wecom/callback
    ?msg_signature=...&timestamp=...&nonce=...&echostr=...
```

backend 用配置的 Token 验证 `msg_signature`，验证通过后用
EncodingAESKey 解密 `echostr` 并以纯文本原样返回。签名错误返回
`401`；服务端未配置企业微信参数返回 `503`。

## 6. 支持的指令

### 6.1 提交任务

**结构化格式**（推荐，解析最稳定）：

```
@AI秘书处
员工：AI CEO
任务：生成今日经营分析
优先级：普通
```

**简单格式**（确定性正则解析，不使用大模型猜测，因此有一定的
格式限制）：

```
让AI CEO生成今日经营分析
```

字段映射：

| 字段 | 说明 |
| --- | --- |
| `assigned_agent` | 必须是已在 AI-Commerce-OS AgentRegistry 注册的真实 Agent 名称，n8n 不做名单校验，交给任务网关在提交时用 404 判断 |
| `task` | 1–64 字符 |
| `priority` | 高/紧急→`high`，普通→`normal`，低→`low`，未指定→`normal` |
| `context` | 固定包含 `{channel: "wecom", sender: "<发送人>"}` |
| `source` | 固定为 `wecom` |
| `request_id` | 企业微信消息的 `MsgId` 派生（见第 8 节），不是随机值 |

无法明确解析出 `assigned_agent` 或 `task` 时，回复固定帮助文案，
**不创建任务**。

### 6.2 查询任务

```
查询 TASK-XXXXXXXXXXXX
任务状态 TASK-XXXXXXXXXXXX
查看 TASK-XXXXXXXXXXXX
```

返回：任务编号、当前状态（等待执行/执行中/已完成/失败）、
AI 员工、优先级、创建时间、完成时间（如有）、安全结果摘要
（completed 时）或安全错误摘要（failed 时）。**查询类消息不创建
任务**。

## 7. 幂等规则

提交任务的 `request_id` 固定为：

```
wecom:<CorpID 的 SHA-256 摘要前 12 位>:<企业微信消息 MsgId>
```

- 同一条企业微信消息（同一 `MsgId`）无论被企业微信服务器重复
  投递多少次，产生完全相同的 `request_id`，只会创建一条任务、
  不会重复执行；
- 不使用发送时间戳，不使用随机 UUID；
- CorpID 不会完整出现在 `request_id`、任务记录或日志里，只有
  一个不可逆的摘要；
- 查询类消息不涉及 `request_id`/幂等（查询本身不创建任何数据）。

## 8. 安全边界

- 企业微信工作流（n8n）**不**直接执行 Agent、**不**在 n8n 里
  维护 Agent 名册、**不**在 n8n 里保存第二套任务状态、**不**
  直接调用 DeepSeek、**不**把业务 Prompt 写进企业微信适配
  workflow；
- backend 的企业微信回调接口**不**解析指令类型，只做验签/解密/
  转发/加密；
- 结果展示统一走 `safe_result`/`safe_error`（阶段 7B 新增的
  `GET /api/v1/integrations/tasks/{task_id}` 安全查询接口），
  递归屏蔽 `api_key`/`token`/`authorization`/`password`/
  `secret`/`database_url`/`db_url`/`access_token` 等字段，超过
  2000 字符截断并提示"结果较长，已截断，请在 Task Center 查看
  完整内容"，不返回原始 HTML、不返回 traceback、不返回
  payload/context；
- 所有 Secret（企业微信 Token/Secret/AESKey、n8n Credential 值、
  backend 网关 Key）均只存在于本机环境文件（600 权限，已被
  `.gitignore` 排除）或 n8n Credentials 加密存储中，不写入 Git、
  不输出到日志、不显示在报告或 Webhook URL 里。

## 9. execution 数据安全

沿用此前 n8n 凭据安全整改轮次确立的策略：

```
EXECUTIONS_DATA_SAVE_ON_SUCCESS=none
EXECUTIONS_DATA_SAVE_ON_ERROR=all
EXECUTIONS_DATA_PRUNE=true
EXECUTIONS_DATA_MAX_AGE=24
```

**企业微信原始消息、Header 和加密字段不会被无条件复制到后续
节点**："Code｜解析指令" 节点只读取 backend 转发的
`$json.body`（即 `{request_id, sender, content, msg_type}`），
不读取、不透传 `$json.headers`；企业微信消息本身的验签/解密只
发生在 backend，backend 转发给 n8n 的请求体里不含 `msg_signature`
或加密字段本身。

## 10. 本地/内网 vs 公网部署要求

- 本地/内网调试：可以使用内网穿透工具临时获得 HTTPS 地址，仅
  用于验证 URL 校验和消息收发是否工作，**用完立即关闭**；
- 正式使用：backend 的
  `/api/v1/integrations/wecom/callback` 必须部署在有效 HTTPS
  证书之后（企业微信强制要求）；
- n8n 的三个 Webhook（统一任务入口、企业微信指令入口、任务状态
  查询）**均不应该直接暴露公网**——"企业微信指令入口"和"任务
  状态查询"设计上只应该被 backend/n8n 内部调用，不面向外部用户；
  "统一任务入口"如果本身也仅供 n8n 内部/受信调用方使用，同样
  建议限制为本地/内网访问；
- 建议保护措施：Nginx 反向代理 + 只允许企业微信官方 IP 段访问
  `/wecom/callback`、VPN/Tailscale、IP 白名单；具体是否需要都
  取决于你的部署环境，本文档不代替你做决策，只列出选项。

## 11. 日志安全

- backend 的企业微信回调日志只记录：任务/消息处理结果的安全
  摘要（不含 Token/Secret/AESKey/消息原文）；
- `request_id` 摘要而不是完整企业微信消息内容会出现在日志里；
- n8n 侧沿用阶段 7A/7C 已确立的日志规则：不记录 Credential 值、
  不记录完整请求体。

## 12. 测试方法

### 12.1 不需要真实企业微信的部分

```bash
cd backend
uv run pytest tests/test_wecom_crypto.py -q
uv run pytest tests/test_wecom_callback_api.py -q
uv run pytest tests/test_task_result_sanitizer.py -q
uv run pytest tests/test_task_safe_query_api.py -q
```

以上测试使用测试专用的随机 Corp ID/Token/EncodingAESKey，验证
签名、加解密、幂等、安全展示、日志安全等逻辑本身的正确性，不
依赖、不调用真实企业微信或真实 n8n。

n8n 侧两个新 workflow 的指令解析/回复格式化逻辑，可以在完成
第 2 节配置前，用 Node.js 直接执行 workflow JSON 里的 Code 节点
源码做离线验证（不需要真实 n8n 进程）。

### 12.2 需要真实企业微信的部分（见第 13 节）

只有你完成第 2 节的全部配置后才能进行，且必须由你确认已完成
配置才可以执行。

## 13. 用户需要完成的配置步骤（汇总）

1. 在企业微信管理后台创建自建应用；
2. 记录 AgentId；
3. 配置可信 IP（如启用了该限制）/可信域名；
4. 配置"接收消息"的服务器 URL（必须是已部署好、能通过 URL
   校验的 HTTPS 地址）；
5. 生成 Token；
6. 生成 EncodingAESKey；
7. 把 CorpID/AgentId/Secret/Token/EncodingAESKey 写入本机
   `backend/.env`（600 权限）；
8. **不要**把以上任何一项发到聊天、文档或提交到仓库。

完成以上步骤后，真实联调按以下顺序进行：企业微信保存回调配置
（触发 GET URL 校验）→ 在企业微信客户端向应用发送一条任务指令
→ 确认收到 `task_id` 回复 → 在 AI-Commerce-OS 启动 Runtime →
向应用发送查询指令确认状态变为已完成 → 重复发送同一条消息确认
不会重复创建任务。
