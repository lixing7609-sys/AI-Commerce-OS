# Workspace 页面映射清单

本轮页面架构重建任务第五阶段交付物。范围：`frontend/src/console/nav/navConfig.js`
（Founder 及其内嵌 AI能力中心/Operator实验室/Studio实验室/Cloud Center）+
独立 `/operator`、独立 `/studio`、独立 `/cloud` 三个standalone应用的权威导航
注册表。共 51 个可达页面（与 `productReview` 元工具沿用的口径一致，`
designDna`/`productReview`/`workspaceProto` 三个内部工具页不计入业务页面数）。

字段说明：
- **重构后 Workspace 类型**：Command / Canvas / Editor / Operations / Asset / Analytics 六选一（母版定义见 `frontend/src/console/workspace/`）。
- **优先级**：P0 = 与本轮 5 个母版直接对应，母版确认后立即迁移；P1 = 结构相似，可复用同一母版迁移；P2 = 需要先补充母版变体或数据后迁移。

## 一、Founder 工作台（founderWorkspaceGroup）

| 页面名称 | 路由 (`?module=`) | 当前页面类型 | 当前主要问题 | 重构后 Workspace | 表格 | 画布 | 编辑器 | 右侧上下文栏 | 人工授权 | 优先级 |
|---|---|---|---|---|---|---|---|---|---|---|
| 今日总览 | founderWorkbench | AI秘书对话 + KPI仪表盘混合 | 两个 tab 缝合了 Command 和 Analytics 两种语法 | Command（秘书）+ Analytics（今日经营，拆分为独立 tab 保留） | 否 | 否 | 否 | 是（AI建议） | 是 | P0 |
| 决策中心 | decisions | 卡片列表 | 说明性卡片偏多，操作按钮分散 | Command | 否 | 否 | 否 | 是 | 是 | P0 |
| 开发进度 | development | 看板式卡片 | 尚可，需改为标准 Command 队列 | Command | 否 | 否 | 否 | 否 | 否 | P1 |
| 经营验证 | businessValidation | KPI卡片+表格 | 验证结论应是任务而非仪表盘 | Command | 否 | 否 | 否 | 是 | 是 | P1 |
| 内容验证 | contentValidation | KPI卡片+表格 | 同上 | Command | 否 | 否 | 否 | 是 | 是 | P1 |
| 云端状态 | cloudStatus | KPI卡片 | 纯状态展示，符合 Analytics 但当前样式与业务页无区分 | Analytics | 否 | 否 | 否 | 否 | 否 | P2 |
| 风险中心 | risks | StatGrid+表格+筛选 | 风险应是待处理队列，不是统计表 | Command | 否 | 否 | 否 | 是 | 是 | P0 |
| 通知中心 | notifications | 列表卡片 | 结构已接近 Command，标题重复 | Command | 否 | 否 | 否 | 否 | 否 | P1 |

## 二、AI 能力中心（aiCapabilityCenterGroup）

| 页面名称 | 路由 | 当前页面类型 | 当前主要问题 | 重构后 Workspace | 表格 | 画布 | 编辑器 | 右侧上下文栏 | 人工授权 | 优先级 |
|---|---|---|---|---|---|---|---|---|---|---|
| Agent 中心 | agentCenter | 表格+统计卡片 | 是资产管理场景，误用了通用后台模板 | Asset | 是（列表态可选） | 否 | 否 | 是 | 否 | P0 |
| Agent 工作室 | agentStudio | 表单+日志 | 单 Agent 配置，接近编辑器场景 | Editor | 否 | 否 | 是 | 是 | 否 | P1 |
| 模型路由 | modelRouter | 表格 | 规则配置表，属经营操作 | Operations | 是（次级） | 否 | 否 | 否 | 否 | P2 |
| Prompt 中心 | promptCenter | AssetCenterModule 通用列表 | vundefined/Invalid Date 已修复，仍是"列表+弹窗"而非编辑器 | Editor（母版 D 已验证） | 否 | 否 | 是 | 是 | 是 | P0 |
| Skill 中心 | skillCenter | 同上（共用 AssetCenterModule） | 同上 | Editor | 否 | 否 | 是 | 是 | 是 | P0 |
| Workflow 中心 | workflowCenter | 目录+表格 | 工作流编排应是 Canvas | Canvas | 否 | 是 | 否 | 是 | 是 | P0 |
| 自动化策略 | automationPolicy | 表格 | 策略规则，偏 Operations | Operations | 是（次级） | 否 | 否 | 否 | 是 | P2 |
| 回放中心 | replayCenter | 表格+详情 | 时间线回放，需要专属可视化，暂归 Analytics | Analytics | 是 | 否 | 否 | 否 | 否 | P2 |
| 知识中心 | knowledgeCenter | AssetCenterModule 通用列表 | 同 Prompt/Skill | Asset | 否 | 否 | 否 | 是 | 否 | P0 |
| Connector 中心 | connectorCenter | 表格+统计卡片 | 连接器管理，偏 Operations（授权/停用等动作） | Operations | 是（次级） | 否 | 否 | 是 | 是 | P1 |
| 能力中心（目录） | capabilityCenter | 目录+生命周期管理 | 聚合视图，暂归 Asset | Asset | 是 | 否 | 否 | 是 | 否 | P2 |
| 基准测试中心 | benchmarkCenter | 表格 | 测试任务队列，偏 Operations | Operations | 是（次级） | 否 | 否 | 否 | 否 | P2 |
| 评估中心 | evaluationCenter | 表格 | 同上 | Operations | 是（次级） | 否 | 否 | 否 | 是 | P2 |
| 广告策略研发 | adCenter | 表格+实验对比 | A/B 实验对比，偏 Analytics | Analytics | 是 | 否 | 否 | 否 | 是 | P2 |

## 三、Operator 实验室（Founder 内嵌，operatorLabGroup / operatorLabV2）

| 页面名称 | 路由 | 当前页面类型 | 当前主要问题 | 重构后 Workspace | 表格 | 画布 | 编辑器 | 右侧上下文栏 | 人工授权 | 优先级 |
|---|---|---|---|---|---|---|---|---|---|---|
| 经营工作台 | operatorLab/workbench | 快捷入口卡片+提醒卡片 | 卡片墙，应改为待办队列 | Command | 否 | 否 | 否 | 是 | 是 | P0 |
| 商品中心 | productCenter | 表格（母版 C 已验证） | 已确认改造方向 | Operations（母版 C） | 是（次级） | 否 | 否 | 否 | 是 | P0 |
| 订单中心 | orderCenter | 表格 | 与商品中心同构问题 | Operations | 是（次级） | 否 | 否 | 否 | 是 | P0 |
| 客户中心 | operatorLab/customers | 表格 | 同上 | Operations | 是（次级） | 否 | 否 | 是 | 否 | P1 |
| 客服中心 | customerServiceCenter | 8 个 tab 的表格集合 | 会话应为 Command/队列，不是表格 | Operations | 是（次级） | 否 | 否 | 是 | 是 | P0 |
| 营销中心 | operatorLab/marketing | 表格+卡片 | 内容协同，偏 Operations | Operations | 是（次级） | 否 | 否 | 是 | 是 | P1 |
| 广告投放 | operatorLab/ads | 表格+统计卡片 | 投放决策应为队列，效果分析归 Analytics | Operations + Analytics（拆分） | 是 | 否 | 否 | 是 | 是 | P1 |
| 品牌中心 | operatorLab/brand | 表格+素材 | 品牌资产管理场景 | Asset | 否 | 否 | 否 | 是 | 否 | P1 |
| Operator 秘书 | operatorLab/aiSecretary | AI对话 | 已接近 Command 语法 | Command | 否 | 否 | 否 | 是 | 是 | P2 |
| 数据中心 | operatorLab/data | KPI卡片+图表 | 符合 Analytics，样式需与业务页统一 | Analytics | 否 | 否 | 否 | 否 | 否 | P1 |
| 财务与利润 | operatorLab/finance | KPI卡片+表格 | 符合 Analytics | Analytics | 是 | 否 | 否 | 否 | 是 | P1 |
| 组织与审批 | approvalCenter | 表格+审批卡片 | 审批应是 Command 队列 | Command | 否 | 否 | 否 | 是 | 是 | P0 |
| 经营设置 | operatorLab/settings | 表单 | 尚可，配置类页面不强制归六类之一 | Editor（配置态） | 否 | 否 | 是 | 否 | 否 | P2 |

## 四、独立 Operator 预览端（`/operator`，`operator-preview/`）

| 页面名称 | 状态 | 当前问题 | 重构后 Workspace | 优先级 |
|---|---|---|---|---|
| 今日经营 | 已实现 | 与 Founder 内嵌版经营工作台重复 KPI 卡片模板 | Command | P1 |
| Operator 秘书 | 已实现 | 与 SecretaryPanel 是两套输入框，需与全屏 SinoFUT 关系梳理 | Command | P2 |
| 店铺 | 已实现（ShopCenterContent） | 表格为主，符合真实需要（多店铺切换） | Operations | P1 |
| 商品/内容/订单/客服/审批 | 5 项 comingSoon 占位 | 与 Founder 内嵌版已有真实实现不同步 | Operations | P0（先接通真实实现，再套母版） |
| AI 成长 / 成本与 Token / 能力市场 / 设备与更新 / 数据与隐私 / 设置 | 已实现 | 多为信息展示，样式待与 Founder 侧统一 | Analytics / Asset 视页面而定 | P2 |

## 五、Studio 实验室（studioLabGroup，Founder 内嵌与独立 `/studio` 共用同一注册表）

| 页面名称 | 路由 | 当前页面类型 | 当前主要问题 | 重构后 Workspace | 优先级 |
|---|---|---|---|---|---|
| Studio 工作台 | studioLab/workspace | 卡片墙 | 应为 Command（今日创作待办） | Command | P0 |
| AI 图片（内部含"AI图文"） | studioLab/graphicContent | 表格 | 选题/创作应为 Canvas，母版 B 已验证同构方案 | Canvas（母版 A/B 已验证） | P0 |
| AI 视频 | studioLab/aiVideo | 表格+分镜列表 | 同上 | Canvas | P0 |
| AI 文章 | studioLab/aiArticle | 表格 | 长文写作场景，偏 Editor | Editor | P1 |
| AI 直播 | studioLab/aiLive | 表格+排期 | 排期场景，偏 Operations | Operations | P1 |
| AI 短剧 | studioLab/shortDrama | 项目表+角色表+进度表 | 与本轮母版 B 完全对应，已确认改造方案 | Canvas（母版 B） | P0 |
| AI 音频 | studioLab/aiAudio | 表格 | 偏 Editor（脚本+音频轨道） | Editor | P1 |
| 矩阵账号 | studioLab/matrixAccounts | 表格 | 账号矩阵管理，偏 Operations | Operations | P1 |
| 发布中心 | studioLab/publishingCenter | 表格+队列 | 已接近 Operations 队列语法 | Operations | P1 |
| 素材库 | studioLab/assetLibrary | 表格（母版 Asset 未单独建，可直接复用 Asset primitive） | 结构已接近 Asset Workspace，需去表格化为缩略图网格 | Asset | P0 |
| 品牌资产 | studioLab/brandAssets | 表格+卡片 | 同素材库 | Asset | P1 |
| 内容数据 | studioLab/analytics | KPI卡片+图表 | 符合 Analytics | Analytics | P1 |
| Studio 设置 | studioLab/settings | 表单 | 配置类页面 | Editor（配置态） | P2 |

## 六、Cloud Center（cloudCenterGroup：4 项共享 + 6 项 Founder 组合）

| 页面名称 | 路由 | 当前页面类型 | 当前主要问题 | 重构后 Workspace | 优先级 |
|---|---|---|---|---|---|
| 设备管理 | cloudCenter/overview | 表格 | 设备运维应为 Operations（远程诊断动作） | Operations | P0 |
| OTA 更新 | cloudCenter/otaSupport | 表格+进度 | 发布流程，偏 Operations | Operations | P1 |
| 许可证 | cloudCenter/licenses | 表格 | 偏 Operations（续期/吊销动作） | Operations | P1 |
| 节点调度 | cloudCenter/distributedScheduling | 只读表格（功能未启用） | 暂无实际交互，先保留只读 Analytics | Analytics | P2 |
| Token 中心 | cloudToken | KPI卡片+表格 | 符合 Analytics + Operations（充值动作）混合 | Analytics（总览）+ Operations（充值/预警队列） | P1 |
| Marketplace | marketplaceCenter | 多 tab 目录（9 个子 tab） | 上架审核等强流程场景，偏 Operations | Operations | P0 |
| 版本管理 | cloudVersion | 表格 | 灰度发布，偏 Operations | Operations | P1 |
| 资产管理 | cloudAssets | 表格 | 偏 Asset（云端资源） | Asset | P2 |
| 系统监控 | monitoring | KPI卡片+图表 | 符合 Analytics | Analytics | P1 |
| 日志中心 | logs | 表格 | 只读检索场景，符合"表格用于批量查看"原则，保留表格 | Analytics（保留表格视图） | P2 |

## 七、独立 Cloud 应用（`/cloud`，与 Cloud Center 共享 4 项原生 registry）

与第六节"设备管理/OTA更新/许可证/节点调度"四项同源，无独立页面，不重复列出。

---

## 汇总

- 可达业务页面共 **51** 个（Founder 8 + AI能力中心 14 + Operator实验室 13 + 独立Operator预览 11（含5个comingSoon占位记为1类）+ Studio 13 + Cloud Center 10，与"产品审查"模式此前统计口径一致，允许 ±1 因 comingSoon 占位合并计算方式不同）。
- **P0（19 项）**：与 5 个已确认母版结构一一对应，母版验收通过后可直接开始迁移。
- **P1（约 20 项）**：结构相似，可复用同一母版但需要补充该页面专属的数据模型。
- **P2（约 12 项）**：需要先决定所属 Workspace 类型的边界情况（多为"看起来像 Analytics 但带操作动作"的混合页面），建议逐个在迁移前单独确认。

批量迁移只在五个母版通过浏览器验收后开始，本文档作为迁移排期的唯一依据，不再新建平行清单。
