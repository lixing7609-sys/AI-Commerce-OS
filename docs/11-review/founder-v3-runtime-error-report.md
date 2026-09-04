# Founder v3 — Phase 2 运行时错误报告

审计范围：Founder 主应用（正确入口是 `http://localhost:5173/founder`，见下方"入口发现"），含内嵌 Operator 实验室、Studio 实验室。方法见下。

## 零、入口发现（重要，影响交办任务本身的前提）

交办任务写的是"本次只处理 `http://localhost:5173/`"，并把它等同于 Founder 主应用。实际代码（`frontend/src/editions/editionConfig.js`）里，**裸 URL 的默认 Edition 是 `operator-cloud`**（"AI Commerce Operator Cloud"——设备/租户/许可/OTA 云端控制台），不是 Founder。Founder 的真实入口是路径别名 `http://localhost:5173/founder` 或查询参数 `?mode=founder`。这是代码里显式的、有意的设计（见 `editionConfig.js` 顶部长注释，"阶段'三版最终定位'新增，成为裸 URL 的新默认值"），不是本次审计要修的 bug——但它意味着交办任务里"http://localhost:5173/ 即 Founder 主应用"这个前提本身不成立。本报告及 Phase 1/3 文档均以 `/founder` 为准继续审计；建议在最终验收报告里向 Founder 提示这个入口差异，避免以后每次都要多敲一段路径。

## 一、方法

1. **自动化爬取**：新增 `frontend/e2e/founder-v3-full-crawl.spec.js`（一次性审计脚本，非常规回归用例，未接入 CI），用 Playwright 依次展开 Founder 侧边栏五个可折叠分组（产品研发中心 / Operator 实验室 / Studio 实验室 / Marketplace 中心 / 系统与发布）+ 两个常驻总览入口，逐一点击每个 `.fdr-sidebar__subitem`，每次点击后采集 `console.error` / `pageerror`、页面正文预览、全屏截图。共采集 **62 个一/二级导航节点**，运行日志与截图见 `frontend/e2e-report/founder-v3-crawl/`（`report.json` 为结构化结果）。
2. **人工深挖**：自动化爬取只覆盖"点击侧边栏节点后的首次渲染"，不会深入详情页、创建向导、店铺筛选联动等二次交互。针对交办任务里明确点名的"自动化策略页面 `Cannot read properties of undefined (reading 'length')`"，额外做了：
   - 通读 `console/modules/automationPolicy/AutomationPolicyModule.jsx` 与 `console/mock/automationPolicyMock.js` 源码，检查所有 `.length` 访问点；
   - 实机打开该页面并操作（阈值编辑、保存、创建自动化三步向导、复制/删除自定义自动化）；
   - 切换全局店铺筛选器（全部店铺 → 新城 → 演示店铺）后重新进入该页面及 Studio 多个新增页面（AI导演工作台、热点分析、内容项目详情），因为"筛选态切换后子数据未跟着重置/未判空"是这类 bug 最常见的触发路径；
   - 检查 Operator 实验室内是否存在同名或语义相近的"自动化/自动经营"页面（交办任务 Phase 6 第 10 条也提到"修复自动化策略页面的运行时错误"，需要排除是否说的是 Operator 侧）。

## 二、结果：62 项自动爬取 + 人工深挖，0 个可复现的运行时错误

`report.json` 中所有 62 条记录的 `consoleErrors` 和 `clickError` 均为空数组/`null`。人工深挖的路径（自动化策略三步创建向导、AI导演工作台十阶段流程点击、热点分析、店铺筛选切换）同样未复现任何 `console.error`、`pageerror` 或白屏。

**关于交办任务点名的"自动化策略"`.length` 崩溃**：当前代码状态下未复现。可能原因（按可能性排序）：
- 该 bug 出现在某次更早的代码状态，已被最近几次提交（尤其是本轮 Studio V3 大量新增代码落地前后）间接修复；
- Founder 侧的 `自动化策略`（`console/modules/automationPolicy/`）本身写得比较防御——`state.customAutomations` 恒定来自 `getAutomationPolicyState()`，该函数在 `automationPolicyMock.js` 内部初始化为固定数组字面量，从未出现 `undefined` 分支，所有 `.length` 访问（`AutomationPolicyModule.jsx:383`, `:391`, `:299`）都建立在这个不变量上；
- 交办任务截图可能来自 Operator 实验室方向的"自动经营"概念页——但 Operator 实验室当前**没有**独立的"自动经营"导航项（见 Phase 1 路由清单），也没有找到任何文件包含语义相近、且有未判空 `.length` 访问的组件。

**结论**：不将此项标记为"已修复"（找不到对应代码改动），而是标记为**当前未复现**，并在 Phase 6（Operator 实验室重建，需要新增"自动经营"模块）时把"进入该新模块的首次渲染、店铺切换、空数据集三种状态各测一次"列为验收条件，防止同类 bug 在新模块里重新出现。

## 三、发现的真实问题（非崩溃级，但是真实的、可复现的缺陷）

### 3.1 Operator 实验室重复导航（确认复现，对应交办任务问题 #3）

实机操作复现：展开"Operator 实验室"分组后，侧边栏最上方出现 **4 个文案完全相同、无法互相区分的按钮**："该模块尚未和 Operator 实验室完成单一真源合并"（对应 `商品中心`/`订单中心`/`客服中心`/`审批中心` 四个 `pendingOperatorParity: true` 模块），视觉上和下方"店铺/商品/内容/…"这条真正的 Operator 导航完全独立、无法区分彼此对应关系。

代码里这是**有意为之、且有详细注释**的过渡状态（`navConfig.js:18-29`：故意不悄悄隐藏这个缺口），意图是提醒"这几个模块还没和 Operator 实验室完成单一真源合并"。但按钮文案直接把整段解释性文字当作按钮 label 使用，四个按钮之间无法区分是"商品"还是"订单"还是"客服"还是"审批"，实际体验就是交办任务描述的"重复导航和重复业务入口"。**这是 Phase 4/6 需要修的真问题**，修法不是删除这个机制（它背后的诚实标注是好设计），而是让每个按钮显示真实模块名 + 一个"待同步"徽章，而不是把徽章说明文字整个塞进按钮名。

### 3.2 已知诚实占位页（不算 bug，按设计属于"暂未开放"的合法状态）

Operator 实验室的 `商品`/`内容`/`订单`/`客服`/`审批` 五个二级入口渲染 `ComingSoonPage`，明确显示"该模块即将上线"。这属于交办任务 Phase 9 要清理的"文字占位"模式，但当前代码是**诚实标注**（不伪装成已完成），且都有对应的 Founder 侧完整实现可以复用/迁移——处理方式是 Phase 6 的整改范围，不是本报告要列的运行时错误。

### 3.3 非阻断性小问题（来自 Phase 1 静态审计，人工复核确认不是崩溃）

- `EvaluationCenterModule.jsx:76`：`categoryScores.reduce(...) / categoryScores.length`，`categoryScores` 为空数组时结果是 `NaN` 而不是崩溃（`NaN` 会被 React 渲染成文本 "NaN"，用户体感是"数字显示异常"而非白屏）。建议加 `|| 0` 兜底。
- `DashboardModule.jsx:43`：页面内标题写"今日运营"，侧边栏菜单名是"今日经营"，文案不一致（非功能性）。

## 四、附件

- 完整点击日志 + 62 张截图：`frontend/e2e-report/founder-v3-crawl/`
- 爬取脚本：`frontend/e2e/founder-v3-full-crawl.spec.js`（建议 Phase 12 测试阶段决定是否保留为正式回归用例，或在验收后删除——当前是一次性审计工具）
