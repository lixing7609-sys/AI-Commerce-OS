import { useState } from "react";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { useToast } from "../../kit/useToast.js";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { DEMO_STORES, getStoreName } from "../../mock/storesMock.js";
import { TOPIC_STATUSES, getTrendState, updateTopicStatus } from "../../mock/trendMock.js";
import { createRepurposingTask } from "../../mock/contentMock.js";
import { createLivePlan } from "../../mock/liveMock.js";

const STATUS_TONE = {
  待评估: "neutral", 建议跟进: "warning", 已采用: "success", 已忽略: "neutral",
  即将过期: "danger", 已过期: "neutral", 已转内容项目: "info", 已转直播计划: "info",
};

export function TopicPool() {
  const toast = useToast();
  const { navigate } = useConsoleNavContext();
  const [state, setState] = useState(() => getTrendState());
  const [storeFilter, setStoreFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const topics = state.topics.filter((t) => {
    if (storeFilter && t.storeId !== storeFilter) return false;
    if (statusFilter && t.status !== statusFilter) return false;
    return true;
  });

  function handleAction(topic, action) {
    if (action === "content") {
      createRepurposingTask({
        trendSource: topic.trendTitle,
        trendSnapshot: topic.title,
        sourceUrlPlaceholder: "https://mock.trend-source.example/topic",
        sourceType: topic.trendType,
        referenceContent: "（演示）来自选题池，内容原创生产",
        authorizationStatus: "无需授权（仅参考选题信号）",
        storeId: topic.storeId,
        category: topic.category,
        product: topic.product,
        targetAudience: "店铺目标受众",
        creativeAngle: topic.title,
        contentFormat: "商品短视频",
        brandExpression: "沿用店铺品牌语气",
        selfOwnedAssets: [],
        riskLevel: topic.riskLevel,
        promptVersion: "通用运营 Prompt v1",
        skillVersion: null,
        knowledgeVersion: null,
        model: "Claude Sonnet 5",
      });
      setState(updateTopicStatus(topic.id, "已转内容项目"));
      toast("已生成内容项目任务", "success");
      navigate("contentCenter", { subView: "repurposing" });
      return;
    }
    if (action === "live") {
      createLivePlan({
        storeId: topic.storeId,
        platform: DEMO_STORES.find((s) => s.id === topic.storeId)?.platform === "douyin" ? "抖音" : "淘宝",
        account: `${getStoreName(topic.storeId)} · 官方号`,
        title: `直播话题：${topic.title}`,
        mode: "human_ai_assisted",
        theme: topic.title,
        startTime: new Date(Date.now() + 24 * 3600000).toISOString(),
        durationMinutes: 60,
        gmvGoal: 5000,
        orderGoal: 40,
        trafficGoal: 6000,
        adBudget: 200,
        host: "待安排",
      });
      setState(updateTopicStatus(topic.id, "已转直播计划"));
      toast("已生成直播选题", "success");
      navigate("liveCenter", { subView: "planning" });
      return;
    }
    if (action === "ignore") {
      setState(updateTopicStatus(topic.id, "已忽略"));
      toast("已忽略", "success");
      return;
    }
    if (action === "archive") {
      setState(updateTopicStatus(topic.id, "已过期"));
      toast("已归档", "success");
    }
  }

  return (
    <div>
      <div className="fdr-card">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select className="fdr-select" style={{ maxWidth: 160 }} value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)}>
            <option value="">全部店铺</option>
            {DEMO_STORES.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select className="fdr-select" style={{ maxWidth: 160 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">全部状态</option>
            {TOPIC_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="fdr-card">
        <DataTable
          columns={[
            { key: "title", label: "选题" },
            { key: "storeId", label: "店铺", render: (r) => getStoreName(r.storeId) },
            { key: "category", label: "类目" },
            { key: "product", label: "商品" },
            { key: "trendType", label: "类型", render: (r) => (r.trendType === "external" ? "外部热点" : "内部信号") },
            { key: "riskLevel", label: "风险" },
            { key: "opportunityScore", label: "机会分" },
            { key: "status", label: "状态", render: (r) => <StatusPill tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</StatusPill> },
            {
              key: "actions",
              label: "操作",
              render: (r) => (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <Button size="sm" variant="secondary" onClick={() => handleAction(r, "content")}>生成内容项目</Button>
                  <Button size="sm" variant="secondary" onClick={() => handleAction(r, "live")}>生成直播选题</Button>
                  <Button size="sm" variant="ghost" onClick={() => handleAction(r, "ignore")}>忽略</Button>
                  <Button size="sm" variant="ghost" onClick={() => handleAction(r, "archive")}>归档</Button>
                </div>
              ),
            },
          ]}
          rows={topics}
          emptyMessage="当前筛选条件下暂无选题"
        />
      </div>
    </div>
  );
}
