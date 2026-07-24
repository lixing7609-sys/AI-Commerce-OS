import { useState } from "react";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { useToast } from "../../kit/useToast.js";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { DEMO_STORES, getStoreName } from "../../mock/storesMock.js";
import { getContentState } from "../../mock/contentMock.js";

const STATUS_TONE = {
  已发布: "success", 待发布: "info", 待审核: "warning", 生产中: "neutral", 发布失败: "danger",
  草稿: "neutral", 待渠道适配: "warning",
};

function ChannelAdaptation({ state }) {
  const grouped = state.channelVariants.reduce((acc, v) => {
    acc[v.motherContentTitle] = acc[v.motherContentTitle] ?? [];
    acc[v.motherContentTitle].push(v);
    return acc;
  }, {});

  return (
    <div>
      {Object.entries(grouped).map(([mother, variants]) => (
        <div key={mother} className="fdr-card">
          <h3 className="fdr-card__title">母版内容：{mother}</h3>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 0 }}>
            一份母版内容自动生成 {variants.length} 个渠道专属版本，各渠道独立管理审核与发布状态。
          </p>
          <DataTable
            columns={[
              { key: "platform", label: "平台" },
              { key: "account", label: "账号" },
              { key: "contentType", label: "内容类型" },
              { key: "aspectRatio", label: "画幅" },
              { key: "duration", label: "时长" },
              { key: "title", label: "标题" },
              { key: "productAssociation", label: "关联商品" },
              { key: "aiDisclosureRequired", label: "AI 披露要求", render: (r) => (r.aiDisclosureRequired ? "需要" : "不需要") },
              { key: "publishingMode", label: "发布方式" },
              { key: "approvalStatus", label: "审核状态" },
              { key: "publishingStatus", label: "发布状态", render: (r) => <StatusPill tone={STATUS_TONE[r.publishingStatus] ?? "neutral"}>{r.publishingStatus}</StatusPill> },
              { key: "publishedTime", label: "发布时间", render: (r) => (r.publishedTime ? new Date(r.publishedTime).toLocaleString("zh-CN") : "—") },
            ]}
            rows={variants}
          />
        </div>
      ))}
    </div>
  );
}

export function PublishingCalendar() {
  const toast = useToast();
  const { navigate } = useConsoleNavContext();
  const [state] = useState(() => getContentState());
  const [view, setView] = useState("calendar");
  const [range, setRange] = useState("week");
  const [storeFilter, setStoreFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [now] = useState(() => Date.now());
  const rangeMs = range === "day" ? 24 * 3600000 : 7 * 24 * 3600000;

  const entries = state.calendarEntries.filter((e) => {
    if (Math.abs(new Date(e.scheduledAt).getTime() - now) > rangeMs) return false;
    if (storeFilter && e.storeId !== storeFilter) return false;
    if (platformFilter && e.platform !== platformFilter) return false;
    if (statusFilter && e.status !== statusFilter) return false;
    return true;
  }).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button type="button" className={"fdr-btn " + (view === "calendar" ? "fdr-btn--primary" : "fdr-btn--secondary")} onClick={() => setView("calendar")}>发布日历</button>
        <button type="button" className={"fdr-btn " + (view === "channel" ? "fdr-btn--primary" : "fdr-btn--secondary")} onClick={() => setView("channel")}>渠道适配对比</button>
      </div>

      {view === "channel" ? (
        <ChannelAdaptation state={state} />
      ) : (
      <>
      <div className="fdr-card">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 4 }}>
            <button type="button" className={"fdr-btn " + (range === "day" ? "fdr-btn--primary" : "fdr-btn--secondary")} onClick={() => setRange("day")}>按天</button>
            <button type="button" className={"fdr-btn " + (range === "week" ? "fdr-btn--primary" : "fdr-btn--secondary")} onClick={() => setRange("week")}>按周</button>
          </div>
          <select className="fdr-select" style={{ maxWidth: 160 }} value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)}>
            <option value="">全部店铺</option>
            {DEMO_STORES.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select className="fdr-select" style={{ maxWidth: 140 }} value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)}>
            <option value="">全部平台</option>
            <option value="抖音">抖音</option>
            <option value="小红书">小红书</option>
            <option value="视频号">视频号</option>
            <option value="朋友圈">朋友圈</option>
          </select>
          <select className="fdr-select" style={{ maxWidth: 140 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">全部状态</option>
            <option value="待发布">待发布</option>
            <option value="待审核">待审核</option>
            <option value="生产中">生产中</option>
            <option value="已发布">已发布</option>
            <option value="发布失败">发布失败</option>
          </select>
        </div>
      </div>

      <div className="fdr-card">
        <DataTable
          columns={[
            { key: "scheduledAt", label: "计划时间", render: (r) => new Date(r.scheduledAt).toLocaleString("zh-CN") },
            { key: "title", label: "内容" },
            { key: "storeId", label: "店铺", render: (r) => getStoreName(r.storeId) },
            { key: "platform", label: "平台" },
            { key: "contentType", label: "内容类型" },
            { key: "status", label: "状态", render: (r) => <StatusPill tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</StatusPill> },
            {
              key: "actions",
              label: "操作",
              render: (r) => (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <Button size="sm" variant="ghost" onClick={() => navigate("contentCenter", { subView: "repurposing" })}>打开内容</Button>
                  {r.status === "待审核" ? <Button size="sm" variant="ghost" onClick={() => navigate("approvalCenter")}>打开审批</Button> : null}
                  {r.status === "发布失败" ? <Button size="sm" variant="secondary" onClick={() => toast(`（演示）已重试发布「${r.title}」`, "success")}>重试模拟发布</Button> : null}
                  <Button size="sm" variant="ghost" onClick={() => toast("（演示）已改期", "success")}>改期</Button>
                  <Button size="sm" variant="ghost" onClick={() => toast("（演示）已取消", "success")}>取消</Button>
                </div>
              ),
            },
          ]}
          rows={entries}
          emptyMessage="当前范围内暂无发布计划"
        />
      </div>
      <Button variant="primary" onClick={() => navigate("contentCenter", { subView: "repurposing" })}>+ 创建新内容任务</Button>
      </>
      )}
    </div>
  );
}
