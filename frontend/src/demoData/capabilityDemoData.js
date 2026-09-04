/**
 * AI 能力中心（7 页）演示数据入口。Agent/Workflow 的审查锚点定义在
 * sharedDemoEntities，各中心自己的完整目录仍读各自 mock（Agent 工作室
 * 读 console/mock/agentStudioMock.js、Prompt/Skill 读
 * console/shared/assetDomain.js 等）——这里只导出"版本范围/生命周期"
 * 这个 7 个中心共用的展示口径，避免每个中心自己各写一份。
 */
export { FEATURED_AGENT, FEATURED_WORKFLOW } from "./sharedDemoEntities.js";

/** AI 能力中心 §Charter 3.2：设计→配置→测试→评测→审批→发布→观察→优化 */
export const CAPABILITY_LIFECYCLE_STAGES = ["设计", "配置", "测试", "评测", "审批", "发布", "观察", "优化"];

/** 顶部统一的版本范围过滤器选项。 */
export const CAPABILITY_SCOPE_OPTIONS = [
  { key: "all", label: "全部" },
  { key: "founder", label: "Founder" },
  { key: "operator", label: "Operator" },
  { key: "studio", label: "Studio" },
  { key: "cloud", label: "Cloud" },
];
