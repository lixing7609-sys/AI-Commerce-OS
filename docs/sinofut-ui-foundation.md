# SinoFUT UI Foundation（前端示意骨架）

阶段：品牌标识统一 + 全局悬浮示意入口（UI 框架实现）。本次只做两件事——统一系统左上角品牌标识、在所有页面提供 SinoFUT 全局悬浮示意入口——不接入任何真实大模型 / 语音识别 / Agent / Workflow / 通知后端。所有交互均为前端演示骨架，数据来自本地 mock。

## 1. 品牌命名

| 名称 | 含义 |
| --- | --- |
| **SinoFUT** | 系统统一智能品牌与产品主品牌 |
| **AI Commerce OS** | 系统产品名称 |
| **Sino** | 未来语音唤醒词（当前仅文案示意，未接入真实语音） |
| **SinoFUT Core** | 未来统一智能中枢的架构名称（当前尚未接入，见第 5 节边界） |

Founder / Operator / Studio / Cloud 是工作空间/产品角色，不是左上角最高品牌名称——不会再出现在左上角品牌位，而是以次级标签（侧边栏品牌区旁的小徽章、账户区、页面标题等）的形式出现。

## 2. 左上角品牌规范

共享实现：[`frontend/src/shared/sinofut/SinoFUTBrand.jsx`](../frontend/src/shared/sinofut/SinoFUTBrand.jsx) + [`sinofut.css`](../frontend/src/shared/sinofut/sinofut.css)。

- 展开态：两行文字，左对齐——
  - 第一行 **SinoFUT**：~20px / font-weight 700
  - 第二行 **AI Commerce OS**：~11px / font-weight 500 / 次级文字颜色 / 轻微字间距
- 收起态（侧边栏折叠）：只保留紧凑字母标识（"S"方块），hover/focus 时通过 `createPortal` 挂到 `document.body` 的 tooltip 显示完整两行文字——不用相对定位在原地，因为侧边栏容器普遍设了 `overflow: hidden`（沿用 `SidebarFlyout.jsx` 已经踩过并解决的同一个坑）。
- 复用 `src/styles/theme.css` 现有 Design DNA token（`--sidebar-text-primary` / `--sidebar-text-tertiary` 等），不引入新的文字颜色系统。

### 覆盖的 Shell

| Shell | 文件 | 说明 |
| --- | --- | --- |
| Founder（含内嵌的 AI能力中心/Operator实验室/Studio实验室/Cloud Center） | `console/shell/ConsoleSidebar.jsx` | 唯一导航 shell，五大工作空间共用 |
| Founder Design DNA 展示页 | `console/shell/NavigationShellDemo.jsx` | 与真实侧边栏共用同一套 CSS class 的演示器 |
| Operator 独立预览端 | `operator-preview/components/OperatorNav.jsx` | 桌面侧栏 + 移动抽屉头部均已替换 |
| Studio 独立端 | `studio/StudioSidebar.jsx` | |
| Cloud 独立端 | `cloud/CloudConsoleApp.jsx` | |

原有的 Founder/OPERATOR/STUDIO/CLOUD 徽章保留，但从"主品牌两行文字"里移出，改为品牌区旁的次级小标签。

## 3. 全局悬浮入口

共享实现：[`frontend/src/shared/sinofut/SinoFUTWidget.jsx`](../frontend/src/shared/sinofut/SinoFUTWidget.jsx)。

**唯一挂载点**：`frontend/src/main.jsx`，在 `renderForEdition(activeEdition)` 之外、`<StrictMode>` 之内。仓库的四个 Edition（Founder / Operator 独立预览 / Studio / Cloud，以及未接入的 Developer 旧版）在这一层之下才各自分叉成独立的 React 树（`ConsoleApp` / `OperatorPreviewApp` / `StudioApp` / `CloudConsoleApp` / `App`），main.jsx 是它们共同的最高层——挂在这里，所有 Edition 自动获得同一个入口，不逐页/逐 Shell 复制。

Founder 内嵌的 AI能力中心 / Operator实验室 / Studio实验室 / Cloud Center（`console/labs/*Connected.jsx`）都在同一个 Founder React 树内切换模块渲染，不是独立挂载点，因此同样自动覆盖，不需要单独处理。

### 默认形态

- `position: fixed`，默认 `right/bottom: 24px`（窄屏 `16px`）
- 毛玻璃胶囊：`backdrop-filter: blur(var(--glass-blur))` + 半透明背景 + 细边框 + 柔和阴影（新增 token，见 `theme.css` 的 `--glass-surface` / `--glass-surface-strong` / `--glass-border` / `--glass-blur`，浅色/深色两套值都已定义）
- 显示 `Sino` + 状态圆点 + 未读角标

### 与既有 Operator 秘书原型共存

`operator-preview/components/SecretaryPanel.jsx` 是已有的、文档化的"Operator秘书"原型入口（固定右下角），职责范围与 SinoFUT 不同（只回答经营 Runtime 范围内的问题）。本次不删除、不合并这个已有功能——只在 Operator 独立预览端给 SinoFUT 悬浮入口加一个 `stacked` 定位修饰（`main.jsx` 里 `stacked={activeEdition === EDITIONS.OPERATOR}`），让两个入口上下错开，不重叠。

### 点击面板

点击悬浮入口打开毛玻璃面板，包含：

1. 头部：SinoFUT / AI Commerce OS 智能中枢 + 关闭按钮
2. 当前上下文：`当前：{工作空间} · {页面标题}`
3. 四个示意分区：今日关注 / 风险提醒 / AI建议 / 待审批
4. 底部：「演示状态 · SinoFUT Core 尚未接入」标注 + 输入框占位「问 SinoFUT，或输入操作指令……」+ 语音/发送按钮（均为示意，见第 5 节）

### 当前上下文如何获取

不为每个页面单独硬编码。每个 Shell 在自己已有的"页面标题/模块标签"计算逻辑旁边加一行 `useSinoFUTContextPublisher(label)` 调用（见 `shared/sinofut/sinofutContextStore.js`——一个极简的外部 store + `useSyncExternalStore` 订阅），把 `"{工作空间} · {当前模块标签}"` 发布出去：

- Founder：`console/shell/ConsoleTopBar.jsx`——复用已有的 `getModuleConfig(module)?.label`，工作空间前缀按 `getGroupKeyForModule` 映射到 `NAV_GROUPS` 的五个分组名（`founderWorkspaceGroup` 显示为「Founder」，其余四组直接用 navConfig.js 里已有的中文标签）。这一处覆盖 Founder 自身 + 内嵌的 AI能力中心/Operator实验室/Studio实验室/Cloud Center，因为它们共用同一个 ConsoleTopBar。
- Operator 独立预览端：`operator-preview/OperatorPreviewApp.jsx`——复用已有的 `getNavItemByKey(activePage)?.label`。
- Studio 独立端：`studio/StudioApp.jsx`——复用已有的 `getStudioNavItemByKey(activePage)?.label`。
- Cloud 独立端：`cloud/CloudConsoleApp.jsx`——复用已有的 `NAV_ITEMS.find(...)?.label`。

`SinoFUTWidget` 自己只订阅这个 store，不感知任何 Edition 的路由/导航实现。

## 4. 状态模型

数据与 UI 分离——`shared/sinofut/sinofutDemoData.js` 是唯一的 mock 数据源，`SinoFUTWidget.jsx` 只负责渲染：

```js
SINOFUT_DEMO_DATA = {
  focusToday: [{ id, text }],
  alerts: [{ id, text }],
  suggestions: [{ id, text }],
  approvals: [{ id, text }],
}

getSinoFUTStatus(data) => { status: "normal" | "suggestion" | "alert", unreadCount }
```

三种状态：

| status | 触发条件 | 视觉 |
| --- | --- | --- |
| `normal` | 无 alerts/suggestions/approvals | 安静显示，无状态点高亮 |
| `suggestion` | 有 suggestions 或 approvals，无 alerts | 柔和高亮圆点（`--ai-accent`），不弹窗打断 |
| `alert` | 有 alerts | 醒目但克制的警戒圆点（`--danger`，2.4s 柔和呼吸动画，`prefers-reduced-motion` 下关闭动画）+ 悬浮入口上的数字角标 |

未来接入真实事件系统时，只需要替换 `sinofutDemoData.js` 的数据来源（或整体替换成一个真实的状态订阅），`SinoFUTWidget.jsx` 的渲染逻辑不需要改动。

## 5. 当前边界（仅前端示意）

以下功能**均未实现**，面板内已用「演示状态 · SinoFUT Core 尚未接入」标注：

- 未接入任何真实大模型（Claude / OpenAI / DeepSeek / Kimi 等）
- 未实现真实语音唤醒 / 麦克风常驻监听——点击语音按钮只显示提示文案「语音能力将在 SinoFUT Core 中接入，默认唤醒词为 Sino。」
- 未实现真实库存监控 / 消息推送 / Agent 调度 / Workflow 执行
- 输入框「发送」不会调用任何后端，只会显示同样的演示态提示
- 五大工作空间的路由架构未改动，未删除任何现有页面

未来接入 SinoFUT Core 时，预期的替换点是：`sinofutDemoData.js`（mock 数据 → 真实事件订阅）+ `SinoFUTWidget.jsx` 里的 `handleVoiceClick`/`handleSend`（占位提示 → 真实语音/指令处理），UI 结构本身不需要重写。
