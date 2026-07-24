import { PageHeader } from "../../kit/PageHeader.jsx";
import { Tabs } from "../../kit/Tabs.jsx";
import { DemoBadge } from "../../kit/StatusPill.jsx";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { CustomerServiceOverview } from "./CustomerServiceOverview.jsx";
import { UnifiedConversations } from "./UnifiedConversations.jsx";
import { DailyCustomerService } from "./DailyCustomerService.jsx";
import { AfterSalesTab } from "./AfterSalesTab.jsx";
import { HumanTakeover } from "./HumanTakeover.jsx";
import { CustomerServiceRules } from "./CustomerServiceRules.jsx";
import { CustomerServiceKnowledge } from "./CustomerServiceKnowledge.jsx";
import { CustomerServiceReview } from "./CustomerServiceReview.jsx";

/**
 * 客服中心（阶段 Founder V4 架构冻结，客服中心修正）：不是简单改
 * 名——把"售后中心"升级为覆盖"日常客服 + 售后客服"两大业务的
 * 客服中心。订单中心回答"订单状态是什么"；客服中心回答"这个
 * 会话/工单该怎么处理，AI 处理到什么程度，什么时候需要人工介入"。
 * 售后客服完整保留原有的规则匹配 → 责任判定 → 处理方案 → 平台
 * 沟通 → 审批 → 执行 → 跟踪 → 复盘链路，只是从独立的"售后中心"
 * 移到客服中心内部的一个标签页。全部为演示数据，不执行真实客服
 * 回复/退款/换货操作。
 */
const TABS = [
  { key: "overview", label: "客服总览" },
  { key: "conversations", label: "统一会话" },
  { key: "daily", label: "日常客服" },
  { key: "afterSales", label: "售后客服" },
  { key: "takeover", label: "人工接管" },
  { key: "rules", label: "客服规则" },
  { key: "knowledge", label: "客服 Knowledge" },
  { key: "review", label: "客服复盘" },
];

export function CustomerServiceCenterModule() {
  const { subView, navigate } = useConsoleNavContext();
  const activeTab = subView ?? "overview";

  return (
    <div>
      <PageHeader
        title="客服中心"
        subtitle="日常客服 + 售后客服统一管理：AI 处理 → 建议/等待人工接管 → 人工处理 → 交还 AI（演示数据，不执行真实客服回复/退款）"
        actions={<DemoBadge />}
      />
      <Tabs tabs={TABS} activeTab={activeTab} onChange={(t) => navigate("customerServiceCenter", { subView: t })} />

      {activeTab === "overview" && <CustomerServiceOverview />}
      {activeTab === "conversations" && <UnifiedConversations />}
      {activeTab === "daily" && <DailyCustomerService />}
      {activeTab === "afterSales" && <AfterSalesTab />}
      {activeTab === "takeover" && <HumanTakeover />}
      {activeTab === "rules" && <CustomerServiceRules />}
      {activeTab === "knowledge" && <CustomerServiceKnowledge />}
      {activeTab === "review" && <CustomerServiceReview />}
    </div>
  );
}
