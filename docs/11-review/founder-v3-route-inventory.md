# Founder 主应用（localhost:5173/?mode=founder）路由与页面质量总览

审计方法：静态代码审计，不启动浏览器。逐一读取 `frontend/src/console/nav/navConfig.js` → `frontend/src/console/moduleRegistry.jsx` → `frontend/src/console/shell/ConsoleSidebar.jsx` 确定 Founder 一级/二级导航的权威列表，再逐条打开每个模块组件（含其内嵌的 Operator 实验室 `operator-preview/`、Studio 实验室 `studio/`）读取源码评估质量。范围仅限 Founder 主应用可达的路由，不包含独立 `/operator`、`/studio`、`/cloud` 三个 Edition 自己的顶层入口（除非 Founder 导航直接复用了它们的共享组件——Operator 实验室、Studio 实验室、Marketplace 浏览器均属于这种"直接复用同一份组件"的情况，因此纳入本次审计）。

**重要说明——本文档标题分组 vs 实际代码分组**：交办任务要求按"Founder工作台 / Agent中心 / Prompt中心 / Skill中心 / Workflow中心 / Knowledge中心 / Connector中心 / Capability中心 / …"分组。这套分组是 **Phase 4 的目标信息架构**，当前代码里并不存在——`navConfig.js` 里实际的一级分组是 `Founder 总览 / 产品研发中心 / Operator 实验室 / Studio 实验室 / Marketplace 中心 / 系统与发布`（`NAV_GROUPS`，navConfig.js:245-255）。下表按**当前代码的真实分组**组织，每个"产品研发中心"条目都标注了它在 Phase 4 目标信息架构里最可能的落点，供迁移参考。不臆造 Phase 4 分组下当前不存在的路由。

---

## 一、总量统计

| 统计项 | 数量 |
|---|---|
| Founder 一级模块（`FOUNDER_MODULES`） | 22（不含 6 个纯分组容器自身） |
| Operator 实验室子路由（`OPERATOR_NAV_ITEMS`，含内嵌 5 个"即将上线"占位页） | 15 |
| Studio 实验室业务子路由（`studio/navConfig.js` `NAV_ITEMS`，含 2 个隐藏工作台页） | 34 |
| Studio 实验室 Founder 专属"实验控制层"（`studioAgents`…`studioReleases`） | 11 |
| Marketplace 中心子导航（`MARKETPLACE_SUBNAV`） | 10 |
| **合计可达路由数** | **约 92** |
| 明确标注"即将上线"的诚实占位页 | 5（Operator 实验室：商品/内容/订单/客服/审批） |
| Marketplace 中心里标注 `planned`（规划中）的子页 | 2（Release Candidate 提交、分成与结算） |
| `pendingOperatorParity: true` 的"待同步"条目 | 4（商品/订单/客服/审批中心，Founder 有完整实现，Operator 实验室对应位置是占位页） |
| 需要标注为"legacy——按 Phase 4 需要重新归类"的产品研发中心条目 | 6（模型路由/自动化策略/广告策略研发/基准测试中心/回放中心/评估中心） |
| 疑似有运行时报错风险（.length/.map 无空值兜底、状态更新语义不清晰）的页面 | 0 处**确认的**崩溃级 bug；1 处需要关注的重复计算（非崩溃，见 §五） |
| Cloud Center（Asset Registry/Device Center/OTA Center/Version Center/License Center） | **不存在于 Founder 导航树**，见 §六 |

---

## 二、Founder 总览 / 产品研发中心

| 路由 (module/subView) | 菜单名称 | 组件文件 | 状态 | 占位页? | 真实交互 | 真实数据状态 | 重复? | Mock 依赖 | 测试覆盖 | 建议 |
|---|---|---|---|---|---|---|---|---|---|---|
| `?module=secretary` | AI 秘书处 | `console/modules/secretary/SecretaryModule.jsx` | 完整实现 | 否 | 是（对话输入/快捷操作/审批跳转，均调用 `navigate`） | 是（真实后端 `getRuntimeStatus`/`getTaskStats` + mock 分区 `secretaryMock.js`，明确区分 `DemoBadge`） | 否，与 Operator秘书/Studio秘书语义不同（见 navConfig.js:36-43 的三秘书说明） | `console/mock/secretaryMock.js` | 无组件级测试，仅 e2e `founder-nav-consolidation.spec.js:166-190` 验证标签区分 | 保留 |
| `?module=dashboard` | 今日经营 | `console/modules/dashboard/DashboardModule.jsx` | 完整实现 | 否 | 是（时间范围切换、跨模块跳转卡片） | 是（真实 `getDashboardSummary`/`getTaskAnalytics` + `contentMock.js` 经营闭环摘要，`trend.length>0` 前有 `EmptyState` 兜底） | 否 | `console/mock/contentMock.js` | 无 | 保留。小瑕疵：页面内 `<PageHeader title="今日运营">`（DashboardModule.jsx:43）与侧边栏菜单名"今日经营"不一致，建议统一文案 |
| `?module=agentStudio` | Agent 工作室 | `console/modules/agentStudio/AgentStudioModule.jsx` | 完整实现 | 否 | 是（店铺切换、Agent 详情钻取、关系图切换） | 是（真实 `getAgents` + `agentStudioMock.js`/`agentTemplatesMock.js`，未连接时渲染 `EmptyState`，AgentStudioModule.jsx:49-55） | 否 | `console/mock/agentStudioMock.js`, `agentTemplatesMock.js`, `storesMock.js` | 无 | 保留。**Phase 4 落点：Agent 中心** |
| `?module=modelRouter` | 模型路由 | `console/modules/modelRouter/ModelRouterModule.jsx` | 完整实现 | 否 | 是（路由测试器可选 Agent+任务类型解析模型） | 是（真实 `getAgents`/`getLlmStatus` + `modelRouterMock.js`） | **部分重复**：与 Agent 工作室详情页里 `tab="modelRouter"` 深链的模型路由信息是同一份 `agentStudioMock.js` 数据源的不同视图（ModelRouterModule.jsx:115 `navigate("agentStudio",{entityId:row.agent,tab:"modelRouter"})`），本质是"聚合视图 vs 详情视图" | `console/mock/modelRouterMock.js` | 无 | **legacy——按 Phase 4 需要重新归类**：并入 Agent 中心作为"模型路由"子标签，而非独立顶级入口 |
| `?module=automationPolicy` | 自动化策略 | `console/modules/automationPolicy/AutomationPolicyModule.jsx` | 完整实现（含多步创建向导） | 否 | 是（系统策略阈值编辑、自定义自动化创建/测试/复制/删除，均有 `ConfirmModal`） | 是（`automationPolicyMock.js`，空状态 `EmptyState` at :384） | 否 | `console/mock/automationPolicyMock.js` | 无 | **legacy——按 Phase 4 需要重新归类**：落点为 Workflow 中心（本质是"触发器→动作"的工作流规则） |
| `?module=tokenCenter` | Token 中心 | `console/modules/tokenCenter/TokenCenterModule.jsx` | 完整实现（含充值/退款子页） | 否 | 是（授予/充值/退款表单，金额上限校验） | 是（`tokenCenterMock.js` + `shared/agentEvolution/evolutionMock.js` 成本智能） | 否 | `console/mock/tokenCenterMock.js` | 无 | 保留 |
| `?module=adCenter` | 广告策略研发 | `console/modules/adCenter/AdCenterModule.jsx` | 完整实现（含充值/退款子页） | 否 | 是（暂停/恢复投放、学习候选批准/驳回） | 是（`adCenterMock.js`，`hasPolicy` 按 Edition 策略控制审批权限） | 否，与 Operator 的"广告投放"（`adOps`）明确分工：Founder 版是无限制策略研发工具，Operator 版是受限执行视图（AdCenterModule.jsx 无此注释但 `AdOpsPage.jsx:18-27` 有说明） | `console/mock/adCenterMock.js` | e2e `four-product-architecture.spec.js:159` 只测 Operator 侧 `adOps` | **legacy——按 Phase 4 需要重新归类**：目标分组未明确覆盖"广告"，建议放入 Capability 中心或保留为 Founder 专属研发工具并在 Phase 4 中显式定义归属 |
| `?module=benchmarkCenter` | 基准测试中心 | `console/modules/benchmarkCenter/BenchmarkCenterModule.jsx` | 完整实现 | 否 | 是（运行基准测试按钮，含 loading 态 `running`） | 是（`benchmarkMock.js`） | 否 | `console/mock/benchmarkMock.js` | 无 | **legacy——按 Phase 4 需要重新归类**：落点为 Capability 中心（模型/能力评测） |
| `?module=replayCenter` | 回放中心 | `console/modules/replayCenter/ReplayCenterModule.jsx` | 完整实现（Agent 回放 + 经营闭环回放两个 Tab） | 否 | 是（Tab 切换、行点击进入详情） | 是（`replayMock.js` + `agentStudioMock.js` runHistory；经营闭环回放读取真实 `contentMock.js` 事件链，无数据时给出可操作的 `EmptyState` 提示，ReplayCenterModule.jsx:107/158） | 否 | `console/mock/replayMock.js` | 无 | **legacy——按 Phase 4 需要重新归类**：落点为 Workflow 中心或 Capability 中心（回放属于验证/调试能力） |
| `?module=evaluationCenter` | 评估中心 | `console/modules/evaluationCenter/EvaluationCenterModule.jsx` | 完整实现 | 否 | 是（运行评估按钮） | 是（`evaluationMock.js`；`avgScore` 计算 `reduce(...)/categoryScores.length`，EvaluationCenterModule.jsx:76，`categoryScores` 为空数组时结果是 `NaN` 而非崩溃——非阻断性小问题，建议加 `|| 0` 兜底） | 否 | `console/mock/evaluationMock.js` | 无 | **legacy——按 Phase 4 需要重新归类**：落点为 Capability 中心 |

---

## 三、Operator 实验室（`?module=operatorLab`，手风琴展开，子项即 `subView`）

Founder 侧边栏直接复用 `operator-preview/helpers/navigation.js` 的 `OPERATOR_NAV_ITEMS`（唯一权威列表）与 `operator-preview/pageRegistry.jsx` 的 `PAGE_COMPONENTS`，和独立 Operator Edition（`/operator`）**零分叉**（OperatorLab.jsx:40-42 明确注释）。Founder 专属增强仅一处：店铺详情页多一个"平台连接器"标签（`FOUNDER_OVERLAY`，OperatorLab.jsx:15-17）。

| 路由 (subView) | 菜单名称 | 组件文件 | 状态 | 占位页? | 真实交互 | 真实数据状态 | 重复? | Mock 依赖 | 测试覆盖 | 建议 |
|---|---|---|---|---|---|---|---|---|---|---|
| `dashboard` | 今日经营 | `operator-preview/pages/DashboardPage.jsx` | 完整实现 | 否 | 是（跳转到店铺页等） | 是（`fetchRealSystemSnapshot` 真实数据 + demo 数据分区，非 demo 模式下明确展示"尚未接入"空态，DashboardPage.jsx:102-118） | 否 | `operator-preview/previewData.js` | e2e `founder-store-live-pilot.spec.js:81-96` | 保留 |
| `secretary` | Operator秘书 | `operator-preview/pages/SecretaryPage.jsx` | 完整实现 | 否 | 是（5 个 Tab：等待处理/进行中/已完成/异常/AI团队，批准/驳回按钮） | 是（`previewData.js` demo 数据，各 Tab 有独立空状态文案） | 否，与 Founder"AI秘书处"、Studio"Studio秘书"职责边界在代码注释中明确区分（navigation.js:26-35） | `operator-preview/previewData.js` | e2e `founder-nav-consolidation.spec.js:172-176` | 保留 |
| `shops` | 店铺 | `shared/products/operator/ShopCenterContent.jsx`（679 行） | 完整实现 | 否 | 是（编辑/测试连接等，`useState` 多处 `editing`/`testing`） | 是 | 否 | 内部及 `services/shopApi.js` | e2e `founder-store-live-pilot.spec.js:98-131` | 保留 |
| `products` | 商品 | `operator-preview/pages/ComingSoonPage.jsx`（`title="商品"`） | **诚实占位页** | **是**——`该模块即将上线`（ComingSoonPage.jsx:23） | 否 | 否（仅 `plannedFeatures` 静态列表） | 与 Founder `productCenter`（完整实现）**同名不同实现**，属已知记录的未完成收口项（`pendingOperatorParity`） | 无 | 无 | 保留占位，待 Operator 版真正建设或直接复用 Founder 的 `ProductCenterModule` 逻辑改造为 props 接口后共享 |
| `content` | 内容 | `operator-preview/pages/ComingSoonPage.jsx`（`title="内容"`） | **诚实占位页** | **是** | 否 | 否 | 是——内容能力真实实现已存在于 Studio 实验室（`contentProjects` 等），此处是 Operator 消费视角的缺口 | 无 | 无 | 保留占位；导航层已有 `MODULE_REDIRECTS.contentCenter → studioLab/contentProjects` 处理 Founder 侧旧链接，但 Operator 实验室这个"内容"入口未接类似重定向 |
| `adOps` | 广告投放 | `operator-preview/pages/AdOpsPage.jsx`（325 行） | 完整实现 | 否 | 是（批准/驳回/暂停/恢复投放，人工批准强制路径 AdOpsPage.jsx:26-27） | 是（`adOpsMock.js`） | 否，与 Founder `adCenter` 明确分工（见上表） | `operator-preview/helpers/adOpsMock.js` | `operator-preview/helpers/adOpsMock.test.js` + e2e `startup-smoke.spec.js:58-90` | 保留 |
| `orders` | 订单 | `ComingSoonPage.jsx`（`title="订单"`） | **诚实占位页** | **是** | 否 | 否 | 与 Founder `orderCenter`（完整实现）同名不同实现，`pendingOperatorParity` | 无 | 无 | 同"商品" |
| `customerService` | 客服 | `ComingSoonPage.jsx`（`title="客服"`） | **诚实占位页** | **是** | 否 | 否 | 与 Founder `customerServiceCenter` 同名不同实现，`pendingOperatorParity` | 无 | 无 | 同"商品" |
| `approvals` | 审批 | `ComingSoonPage.jsx`（`title="审批"`） | **诚实占位页** | **是** | 否 | 否 | 与 Founder `approvalCenter` 同名不同实现，`pendingOperatorParity` | 无 | 无 | 同"商品" |
| `growth` | AI 成长 | `operator-preview/pages/AIGrowthPage.jsx`（`AIGrowthPage` 导出） | 完整实现 | 否 | 是（批准低风险实验，`hasPolicy` 权限控制） | 是（`shared/agentEvolution/evolutionMock.js`，无学习总结时给出空态 AIGrowthPage.jsx:87-89） | 否 | `shared/agentEvolution/evolutionMock.js` | `shared/agentEvolution/evolutionMock.test.js` | 保留 |
| `costToken` | 成本与 Token | `AIGrowthPage.jsx`（`CostTokenPage` 导出） | 完整实现 | 否 | 是 | 是 | 否，与 Founder `tokenCenter` 定位不同（Operator 是受限消费视图） | 同上 | 同上 | 保留 |
| `marketplace` | 能力市场 | `shared/marketplace/MarketplaceBrowser.jsx`（`theme="operator"`） | 完整实现 | 否 | 是（安装/卸载，诚实展示已安装状态而非伪造支付流程，见 e2e marketplace.spec.js:63-70） | 是（`shared/marketplace/marketplaceService.js` + Cloud Mock） | 与 Studio 的 `marketplace` 页面**共用同一组件**（按设计如此，非 bug——见组件头注释 MarketplaceBrowser.jsx:12-17） | `shared/marketplace/cloudMarketplaceMockApi.js` | `shared/marketplace/marketplaceService.test.js` + e2e `marketplace.spec.js` | 保留 |
| `deviceUpdates` | 设备与更新 | `AIGrowthPage.jsx`（`DeviceUpdatesPage` 导出） | 完整实现 | 否 | 是（授权/撤销诊断，审批更新窗口） | 是（`operator-preview/helpers/deviceMock.js`） | 否 | `deviceMock.js` | `operator-preview/helpers/deviceMock.test.js` + e2e `four-product-architecture.spec.js:147-158` | 保留 |
| `dataPrivacy` | 数据与隐私 | `AIGrowthPage.jsx`（`DataPrivacyPage` 导出） | 完整实现 | 否 | 是 | 是 | 否 | `deviceMock.js` | 同上 | 保留 |
| `settings` | 设置 | `operator-preview/pages/SettingsPage.jsx`（181 行） | 完整实现 | 否 | 是 | 是 | 否 | `operator-preview/helpers/settingsGroups.js` | `operator-preview/helpers/settingsGroups.test.js` | 保留 |

**关于 4 个"待同步"条目**：`productCenter`/`orderCenter`/`customerServiceCenter`/`approvalCenter` 在 Founder 侧边栏渲染在"Operator 实验室"分组旁但作为独立顶级模块（非 Operator 实验室子项），带 `pendingOperatorParity: true` 标记和"待同步"角标（navConfig.js:132-163，ConsoleSidebar.jsx:83/87）。这不是意外重复，而是代码注释明确记录的已知缺口（navConfig.js:18-29）：这 4 个模块只在 Founder 有完整实现，Operator 实验室对应位置目前是诚实的"即将上线"占位页，尚未完成把 Founder 实现改造成可被两端复用的 props 接口。

---

## 四、Studio 实验室（`?module=studioLab`，手风琴展开）

### 4.1 业务导航（复用 `studio/navConfig.js` `NAV_ITEMS`，与独立 Studio Edition 零分叉）

| 路由 (subView) | 菜单名称 | 组件文件 | 状态 | 占位页? | 真实交互 | 真实数据状态 | 重复? | Mock 依赖 | 测试覆盖 |
|---|---|---|---|---|---|---|---|---|---|
| `secretary` | Studio秘书 | `studio/pages/SecretaryPage.jsx`（204 行） | 完整实现 | 否 | 是（快速操作 8 个入口，热点"开始创作"跳转） | 是（`studioMock.js`/`hotspotMock.js`/`studioAgentMock.js`/`monetizationMock.js` 综合） | 否 | 见上 | e2e `studio-v3-integration.spec.js:52-71` |
| `overview` | Studio概览 | `studio/pages/OverviewPage.jsx` | 完整实现 | 否 | 是（12 个统计卡均可跳转） | 是（`studioMock.js`） | 否 | `studio/mock/studioMock.js` | 无专项，被多个 e2e 间接覆盖 |
| `hotspotAnalysis` | 热点分析 | `studio/pages/HotspotPages.jsx`（`HotspotAnalysisPage`） | 完整实现 | 否 | 是（平台筛选、创建项目按钮） | 是（`hotspotMock.js`） | 否 | `studio/mock/hotspotMock.js` | `studio/mock/hotspotMock.test.js` |
| `trendForecast` | 趋势预测 | `HotspotPages.jsx`（`TrendForecastPage`） | 完整实现（只读表格） | 否 | 否（无写操作，纯展示） | 是 | 否 | 同上 | 同上 |
| `topicPool` | 选题池 | `HotspotPages.jsx`（`TopicPoolPage`） | 完整实现 | 否 | 是（批准/驳回选题，驳回后可创建项目） | 是 | 否 | 同上 | 同上 |
| `contentProjects` | 内容项目 | `studio/pages/ContentPages.jsx`（`ContentProjectsPage`） | 完整实现 | 否 | 是（新建项目弹窗 `ProjectCreationModal`、类型筛选、进入导演台） | 是（`studioMock.js`） | 否 | `studio/mock/studioMock.js` | `studio/mock/studioMock.test.js` |
| `shortDrama` | AI短剧 | `ContentPages.jsx`（`ShortDramaPage`） | 完整实现（只读） | 否 | 否 | 是（角色/分镜/发行数据均为结构化 mock） | 否 | 同上 | 同上 |
| `aiVideo` | AI视频 | `ContentPages.jsx`（`AiVideoPage`） | 完整实现（只读） | 否 | 否 | 是 | 否 | 同上 | 同上 |
| `graphicContent` | AI图文 | `studio/pages/GraphicContentPages.jsx`（`GraphicContentListPage`） | 完整实现 | 否 | 是（新建、行点击进入编辑器） | 是（`graphicContentMock.js`） | 否 | `studio/mock/graphicContentMock.js` | `graphicContentMock.test.js` + e2e `studio-v3-integration.spec.js:108-140` |
| `aiLive` | AI直播 | `ContentPages.jsx`（`AiLivePage`） | 完整实现（只读） | 否 | 否 | 是 | 否 | `studioMock.js` | 同上 |
| `scriptStoryboard` | 剧本/脚本/分镜 | `studio/pages/CreationWorkbenchPages.jsx`（`ScriptStoryboardPage`） | 完整实现 | 否 | 是（三 Tab 工作台，场次/镜头增删改） | 是（`directorMock.js` + 页面内 seed 状态） | 否 | `studio/mock/directorMock.js` | `directorMock.test.js` |
| `characterScene` | 角色与场景 | `CreationWorkbenchPages.jsx`（`CharacterScenePage`） | 完整实现 | 否 | 是（角色/场景字段编辑、版本升级） | 是（组件内 seed，非持久化） | 否 | 无独立 mock 文件（seed 硬编码于组件） | 无 |
| `mediaGeneration` | 图片/视频生成 | `CreationWorkbenchPages.jsx`（`MediaGenerationPage`） | 完整实现 | 否 | 是（重新生成/生成B版按钮） | 是 | 否 | `studioMock.js` | 无 |
| `aiEditing` | AI剪辑 | `CreationWorkbenchPages.jsx`（`AiEditingPage`） | 完整实现 | 否 | 是（16 项剪辑操作可切换、预览/导出/提交审核） | 是（本地 state） | 否 | 无 | 无 |
| `voiceSubtitleBgm` | 配音/字幕/BGM | `CreationWorkbenchPages.jsx`（`VoiceSubtitleBgmPage`） | 完整实现 | 否 | 是（试听、字幕开关、BGM 选择） | 是（本地 state） | 否 | 无 | 无 |
| `contentReview` | 内容审核 | `CreationWorkbenchPages.jsx`（`ContentReviewPage`） | 完整实现 | 否 | 是（10 项检查结果切换，全部通过才能批准发布） | 是 | 否 | 无 | 无 |
| `matrixAccounts` | 矩阵账号 | `studio/pages/MatrixAssetPages.jsx`（`MatrixAccountsPage`） | 完整实现（只读） | 否 | 否 | 是 | 否 | `studioMock.js` | `studioMock.test.js` |
| `matrixPublish` | 矩阵发布 | `MatrixAssetPages.jsx`（`MatrixPublishPage`） | 完整实现 | 否 | 是（失败重试） | 是 | 否 | 同上 | 同上 |
| `contentAssets` | 内容资产 | `MatrixAssetPages.jsx`（`ContentAssetsPage`） | 完整实现（只读） | 否 | 否 | 是 | 否 | 同上 | 同上 |
| `trafficPool` | 流量池 | `studio/pages/TrafficAdPages.jsx`（`TrafficPoolPage`） | 完整实现（只读） | 否 | 否 | 是（体现"内容→账号→人群→流量→广告→收入"链路） | 否 | `studioMock.js` | 无 |
| `adResources` | 广告资源 | `TrafficAdPages.jsx`（`AdResourcesPage`） | 完整实现 | 否 | 是（模拟预定） | 是 | 否 | 同上 | 无 |
| `adOrders` | 广告订单 | `TrafficAdPages.jsx`（`AdOrdersPage`） | 完整实现（只读） | 否 | 否 | 是 | 否 | 同上 | 无 |
| `monetizationCenter` | 商业变现 | `studio/pages/MonetizationPages.jsx`（`MonetizationCenterPage`） | 完整实现 | 否 | 是（7 个收入卡跳转子页） | 是（`monetizationMock.js` + 跨引用 `studioMock.js`/`graphicContentMock.js`） | 否 | `studio/mock/monetizationMock.js` | 无 |
| `revenueShare` | 平台分成 | `MonetizationPages.jsx`（`RevenueSharePage`） | 完整实现（只读） | 否 | 否 | 是 | 否 | 同上 | 无 |
| `brandDeals` | 品牌合作 | `MonetizationPages.jsx`（`BrandDealsPage`） | 完整实现 | 否 | 是（阶段推进按钮） | 是 | 否 | 同上 | 无 |
| `liveCommerce` | 带货与直播 | `MonetizationPages.jsx`（`LiveCommercePage`） | 完整实现（只读） | 否 | 否 | 是 | 否 | 同上 | 无 |
| `knowledgeProducts` | 知识产品 | `MonetizationPages.jsx`（`KnowledgeProductsPage`） | 完整实现（只读） | 否 | 否 | 是 | 否 | 同上 | 无 |
| `ipLicensing` | 版权/IP授权 | `MonetizationPages.jsx`（`IpLicensingPage`） | 完整实现（只读） | 否 | 否 | 是 | 否 | 同上 | 无 |
| `computeTasks` | 算力任务 | `studio/pages/PlatformPages.jsx`（`ComputeTasksPage`） | **半占位**——页面顶部自行标注"架构预留"（PlatformPages.jsx:28-33） | 部分——非"即将上线"文案，但"已分配设备数量"/"当前运行设备数量"两个统计卡硬编码为 `0`（PlatformPages.jsx:38-39），不是从数据计算得出 | 否 | 否（`isDistributedComputeEnabled()` 恒为关闭态） | 否 | `shared/distributedCompute/mockComputeRepository.js` | `shared/distributedCompute/distributedCompute.test.js` |
| `dataAnalytics` | 数据分析 | `PlatformPages.jsx`（`DataAnalyticsPage`） | 完整实现（只读聚合） | 否 | 否 | 是 | 否 | `studioMock.js` | 无 |
| `marketplace` | 能力市场 | `shared/marketplace/MarketplaceBrowser.jsx`（`theme="studio"`） | 完整实现 | 否 | 是 | 是 | 与 Operator `marketplace` 共用同一组件（设计如此） | 见上表 | 见上表 |
| `studioSettings` | Studio设置 | `PlatformPages.jsx`（`StudioSettingsPage`） | 完整实现（纯信息展示） | 否 | 否 | 否（静态产品信息） | 否 | 无 | 无 |
| `platformConnections` | 平台连接 | `PlatformPages.jsx`（`PlatformConnectionsPage`） | 完整实现 | 否 | 是（连接/断开切换） | 是（组件内 seed） | 否 | 无 | 无 |
| `brandGuidelines` | 品牌规范 | `PlatformPages.jsx`（`BrandGuidelinesPage`） | 完整实现（表单） | 否 | 是（保存） | 否（无持久化，仅演示反馈） | 否 | 无 | 无 |
| `notificationsPermissions` | 通知与权限 | `PlatformPages.jsx`（`NotificationsPermissionsPage`） | 完整实现 | 否 | 是（通知开关） | 是（本地 state） | 否 | 无 | 无 |
| `director`（隐藏，通过项目行/秘书进入） | AI导演工作台 | `studio/pages/DirectorWorkspace.jsx`（339 行） | 完整实现，本轮最核心页面 | 否 | 是（十阶段流程点击、镜头增删改查/重新生成/锁定/排序，三栏结构） | 是（`directorMock.js`） | 否 | `studio/mock/directorMock.js` | `directorMock.test.js` + e2e `studio-v3-integration.spec.js:73-106` |
| `graphicContentEditor`（隐藏） | AI图文编辑器 | `GraphicContentPages.jsx`（`GraphicContentEditorPage`） | 完整实现（三栏结构化内容块编辑器） | 否 | 是（内容块增删改/AI改写/重新生成配图/平台版本生成） | 是（`graphicContentMock.js`） | 否 | 同上 | e2e `studio-v3-integration.spec.js:119-140` |

### 4.2 Founder 专属"Studio 实验控制层"（`studioAgents`…`studioReleases`，独立顶级 module key，渲染在 Studio 实验室手风琴内业务导航之后）

| 路由 (module) | 菜单名称 | 组件文件 | 状态 | 真实交互 | 真实数据状态 | Mock 依赖 | 建议 |
|---|---|---|---|---|---|---|---|
| `?module=studioAgents` | Studio Agent | `console/modules/studioLab/StudioAgentModules.jsx`（`StudioAgentsModule`） | 完整实现 | 部分（选中行查看编辑入口说明，无内联编辑） | 是（27 个角色化 Agent，`studioAgentMock.js`） | `studio/mock/studioAgentMock.js` | 保留。**Phase 4 落点：Agent 中心** |
| `?module=studioPrompts` | Studio Prompt | 同文件（`StudioPromptsModule`） | 完整实现 | 是（发布/回滚版本） | 是 | 同上 | 保留。**落点：Prompt 中心** |
| `?module=studioSkills` | Studio Skill | 同文件（`StudioSkillsModule`） | 完整实现（只读表） | 否 | 是 | 同上 | 保留。**落点：Skill 中心** |
| `?module=studioWorkflows` | Studio Workflow | 同文件（`StudioWorkflowsModule`） | 完整实现（只读表，Tab 切换内容/图文十阶段） | 否 | 是（`directorMock.js`/`graphicContentMock.js`） | 同上 | 保留。**落点：Workflow 中心** |
| `?module=studioModelRouting` | Studio 模型路由 | 同文件（`StudioModelRoutingModule`） | 完整实现（表单编辑+保存） | 是 | 是 | 同上 | 保留。**落点：Agent 中心的模型路由子标签**（与顶层 `modelRouter` 同类重复问题，见 §五） |
| `?module=studioPromptTest` | Prompt测试台 | `StudioTestingModules.jsx`（`StudioPromptTestModule`） | 完整实现 | 是（运行测试、采用某版本） | 是 | 同上 | 保留 |
| `?module=studioReplay` | 真实任务回放 | 同文件（`StudioReplayModule`） | 完整实现 | 是（重新运行） | 是 | 同上 | 保留 |
| `?module=studioEvaluation` | A/B评测 | 同文件（`StudioEvaluationModule`） | 完整实现（只读） | 否 | 是 | 同上 | 保留 |
| `?module=studioLogs` | 运行日志 | `StudioOpsModules.jsx`（`StudioLogsModule`） | 完整实现 | 是（按 Agent 过滤） | 是 | 同上 | 保留 |
| `?module=studioCosts` | 成本分析 | 同文件（`StudioCostsModule`） | 完整实现（只读聚合） | 否 | 是 | 同上 | 保留 |
| `?module=studioReleases` | 版本与发布 | 同文件（`StudioReleasesModule`） | 完整实现，但页面自己明确声明"安装状态为占位展示——本轮未接入真实的包分发/安装执行系统"（StudioOpsModules.jsx:91） | 是（扩大灰度/发布/回滚均为演示 toast，不产生真实分发） | 是（`studioMock.js` releases 列表本身是真实结构，只是"安装执行"这一步是 mock） | 同上 | 保留，但应在 UI 上更醒目地标注"安装执行为演示" |

---

## 五、Marketplace 中心（`?module=marketplaceCenter`）

组件：`console/labs/MarketplaceCenter.jsx`（332 行）。子导航来自 `MARKETPLACE_SUBNAV`（navConfig.js:266-277），`status` 字段真实标注完成度，UI 据此渲染角标（ConsoleSidebar.jsx:42/103-105），**不存在"把未完成功能包装成已上线"的问题**。

| subView | 菜单名称 | 状态 | 占位页? | 真实交互 | 备注 |
|---|---|---|---|---|---|
| `overview` | Marketplace 概览 | 完整实现 | 否 | 是（统计卡跳转） | — |
| `myPackages` | 我的能力包 | 完整实现 | 否 | 是（进入详情弹窗管理版本/审核/渠道） | — |
| `review` | 上架审核 | 完整实现 | 否 | 是 | 过滤 `myPackages` 的 submitted/in_review 子集 |
| `releaseCandidate` | Release Candidate 提交 | **`planned`（规划中）** | 是（`PlannedNotice` 组件，MarketplaceCenter.jsx:261） | 否 | 诚实标注，非 bug |
| `versionsGray` | 版本与灰度 | 完整实现（只读表+跳转管理） | 否 | 是 | — |
| `pricingLicense` | 定价与 License | 完整实现（只读） | 否 | 否 | — |
| `salesDownloads` | 销售与下载 | 完整实现（只读，按安装数排序） | 否 | 否 | — |
| `developers` | 开发者中心 | 完整实现（只读） | 否 | 否 | — |
| `settlement` | 分成与结算 | **`planned`（规划中）** | 是 | 否 | 诚实标注，说明需要 Operator Cloud 真实支付后端 |
| `cloudConsole` | Cloud Marketplace 控制台 | **`cloudMock`** | 是（`CloudConsoleNotice`，按钮 `disabled`，明确文案"尚未接入真实 Operator Cloud 后端"） | 否 | 这是 Founder 侧唯一提及"Cloud"的入口，且明确是禁用占位——不是真正的 Cloud Center，见 §六 |

---

## 六、Cloud Center（Asset Registry / Device Center / OTA Center / Token Center / Marketplace / Version Center / License Center）

**结论：Founder 导航树中不存在这一分组或任何这些子路由。** 全代码库搜索 `AssetRegistry`/`DeviceCenter`/`OTACenter`/`VersionCenter`/`LicenseCenter`（大小写不敏感）在 `frontend/src/console/` 下无匹配。Founder 唯一涉及"Cloud"字样的入口是上表的 `cloudConsole`（Marketplace 中心内的一个禁用占位子页）。

真正的 Asset Registry/Device Center/OTA Center/Token Center/Version Center/License Center 属于**独立的 Operator Cloud Edition**（`frontend/src/cloud/CloudConsoleApp.jsx`，通过 `/cloud` 路径别名或裸 URL 默认进入，`editionConfig.js:60` `DEFAULT_EDITION = EDITIONS.OPERATOR_CLOUD`），按任务范围要求（"不要碰独立 `/operator`、`/studio` 应用……除非 Founder 自己的导航链接过去"）不在本次审计范围内——因为 Founder 的 `cloudConsole` 子页并不真正链接到 `CloudConsoleApp.jsx`，只是一段说明文字加一个禁用按钮。

如果 Phase 4 的目标信息架构确实要求 Founder 内新增一个"Cloud Center"分组覆盖这 6 项子路由，这是一项**全新的建设工作**，不是"文档没写全"——当前实现中这些页面/路由完全不存在。

---

## 七、Legacy / 重定向专用条目

| module key | 说明 | 当前状态 |
|---|---|---|
| `storeCenter` | 已从 `MODULE_COMPONENTS` 移除，仅在 `MODULE_REDIRECTS` 中保留（navConfig.js:307），`?module=storeCenter` 会被自动重定向到 `operatorLab/shops` | 非活跃菜单项，纯兼容旧收藏夹链接 |
| `contentCenter` | 重定向到 `studioLab/contentProjects`（navConfig.js:304） | 同上 |
| `liveCenter` | 重定向到 `studioLab/aiLive`（navConfig.js:305） | 同上 |
| `trafficNetworkCenter` | 重定向到 `studioLab/matrixAccounts`（navConfig.js:306） | 同上 |

以上 4 项**不是**当前侧边栏可点击的菜单（`ConsoleSidebar.jsx` 不渲染它们），只在 URL 层通过 `useConsoleNav.js` 的 `resolveModuleRedirect` 处理旧链接，e2e `founder-nav-consolidation.spec.js:123-138` 有专项测试覆盖，行为正确。**未发现名为"真实经营"、独立"Token中心"（顶级重复）等交办任务提示中列出但实际不存在的遗留项**——全仓库搜索"真实经营"只出现在代码注释里，从未作为菜单文案存在过（`console/mock/operatingLoopMock.js:4`、`console/mock/contentMock.js:741`、`operator-preview/previewData.js:7`）；`Token 中心`只有 Founder 一份实现（`tokenCenter`），Operator 侧对应的是语义不同的"成本与 Token"（`costToken`，受限消费视图），不构成重复。

---

## 八、需要关注的代码模式（非崩溃级，供后续重构参考）

1. `frontend/src/console/modules/evaluationCenter/EvaluationCenterModule.jsx:76` — `avgScore` 渲染为 `Math.round(r.categoryScores.reduce((sum,c)=>sum+c.score,0) / r.categoryScores.length)`；若某条评估记录的 `categoryScores` 为空数组会得到 `NaN` 显示（不会抛异常/白屏），建议补 `|| 0` 或空数组兜底文案。
2. `frontend/src/console/modules/dashboard/DashboardModule.jsx:43` — `<PageHeader title="今日运营">` 与侧边栏菜单名"今日经营"文案不一致，属于纯文案不一致，不影响功能。
3. `frontend/src/studio/pages/SecretaryPage.jsx:42-44` — `featuredProjects` 构造里对同一个 `getStudioState()` 调用了两次（`state.contentProjects.find(...)` 已经取过一次 state，又调用 `getStudioState().contentProjects.find(...)` 再取一次），是多余的重复调用而非 bug（`getStudioState()` 是纯函数，无副作用），建议合并为一次。
4. `frontend/src/studio/pages/PlatformPages.jsx:38-39` — "算力任务"页的"已分配设备数量"/"当前运行设备数量"两个统计卡硬编码为字面量 `0`，不是从 `devicePool`/`computeTasks` 计算得出；页面本身已用"架构预留"角标做了诚实声明（同文件 :28-33），但两个具体数字字段容易被误读成"当前确实是 0"而非"字段尚未接入计算逻辑"，建议要么去掉这两个具体数字改成"—"，要么补上真实计算。
5. 所有列表类页面统一使用 `?.`/`??`/`Array.isArray()` 兜底（例如 `AgentStudioModule.jsx:27` `Array.isArray(agents.data?.items) ? ... : []`），**未发现**未加保护的 `.length`/`.map` 直接作用于可能为 `undefined` 的 props/state 的情况——这是本次审计里最值得记录的正面发现：Founder 主应用的空值防御模式非常一致。

---

## 九、总体质量结论

- Founder 一级模块（§二）与 Founder 专属"Studio 实验控制层"（§4.2）**全部**是完整实现：真实交互（表单、弹窗、状态流转、审批链路）+ 真实数据状态（连接态/空态/loading 态分区，`DemoBadge` 诚实标注演示数据）+ 有明确的 mock 数据源。没有发现挂着菜单项却打开白屏或"施工中"占位文案的情况。
- Operator 实验室 15 项中 5 项（商品/内容/订单/客服/审批）是诚实占位页，但这是**代码显式记录的已知缺口**（`pendingOperatorParity`），不是被隐藏的实现缺失。
- Studio 实验室 34 项业务路由中，只有 1 项（`computeTasks` 算力任务）存在"架构预留、部分字段硬编码占位数字"的情况，其余全部是完整实现，相当一部分（约 40%）是只读聚合表格而非可写交互——这是合理的产品设计（结算/收入类页面本身就该是只读报表），不构成"半成品"。
- 组件级单元测试覆盖薄弱（大部分测试集中在 mock/数据层与 e2e 层），但 e2e 覆盖了导航结构、深链恢复、跨端一致性等关键行为。
- 6 个"产品研发中心"条目（模型路由/自动化策略/广告策略研发/基准测试中心/回放中心/评估中心）需要在 Phase 4 迁移中重新确定归属分组，这是信息架构层面的待办，不是实现质量问题——每一项本身的实现都是完整的。
- Cloud Center 六项子路由（Asset Registry 等）在 Founder 侧完全不存在，如果 Phase 4 需要它们，属于新建而非修复。

---

*本文档为只读静态审计产出，未修改任何源码。*
