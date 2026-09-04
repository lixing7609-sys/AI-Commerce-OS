import { useState } from "react";
import {
  PageHeader,
  StatGrid,
  StatCard,
  DemoBadge,
  Tabs,
  SearchField,
  FilterBar,
  Button,
  TextButton,
  EmptyState,
  ErrorState,
  Drawer,
  Modal,
  Checkbox,
  KeyValueList,
  StatusPill,
} from "../../kit/index.js";
import { getNotifications, NOTIFICATION_CATEGORY_LABEL } from "../founderWorkspace/workspaceEntities.js";
import {
  DrillDownLink,
  WorkspaceLoadingSkeleton,
  RestrictedAction,
} from "../founderWorkspace/WorkspaceKit.jsx";
import { useDemoLoading, useDemoRefreshFailure } from "../founderWorkspace/useWorkspaceDemoState.js";
import { useToast } from "../../kit/useToast.js";

const CATEGORY_TABS = [
  { key: "all", label: "全部" },
  ...Object.entries(NOTIFICATION_CATEGORY_LABEL).map(([key, label]) => ({ key, label })),
];

/**
 * Founder Workspace · 通知中心 — promoted from the sidebar bell's
 * hardcoded stub (ConsoleSidebar.jsx) to a full page reading the same
 * feed; the flyout is a live preview of this page's data (Charter
 * §3.1). Adds category tabs, read/unread state, and a local
 * notification-settings entry per the 中文框架审查 spec.
 */
export function NotificationsModule() {
  const loading = useDemoLoading();
  const { failed, triggerRefresh } = useDemoRefreshFailure();
  const showToast = useToast();

  const [notifications, setNotifications] = useState(() => getNotifications());
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [detailId, setDetailId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [categoryEnabled, setCategoryEnabled] = useState(() =>
    Object.fromEntries(Object.keys(NOTIFICATION_CATEGORY_LABEL).map((key) => [key, true]))
  );

  function handleRefresh() {
    const willSucceed = failed;
    triggerRefresh();
    if (willSucceed) showToast("通知列表已刷新", "success");
  }

  function toggleRead(id) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: !n.read } : n)));
  }

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    showToast("已全部标记为已读", "success");
  }

  function saveSettings() {
    setSettingsOpen(false);
    showToast("通知设置已保存（演示，不影响真实推送）", "success");
  }

  const filtered = notifications
    .filter((n) => (category === "all" ? true : n.category === category))
    .filter((n) => (query.trim() ? n.title.includes(query.trim()) : true));

  const unreadCount = notifications.filter((n) => !n.read).length;
  const detailNotification = notifications.find((n) => n.id === detailId) ?? null;

  const activeFilters = query.trim() ? [{ key: "q", label: `搜索：${query.trim()}`, onRemove: () => setQuery("") }] : [];

  if (loading) {
    return <WorkspaceLoadingSkeleton title="通知中心" subtitle="系统 / 审批 / 经营 / 内容 / 设备 / 安全六类通知统一入口" />;
  }

  return (
    <div>
      <PageHeader
        title="通知中心"
        subtitle="系统 / 审批 / 经营 / 内容 / 设备 / 安全六类通知统一入口，侧边栏铃铛是本页数据的预览"
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <DemoBadge />
            <Button variant="primary" size="sm" onClick={markAllRead} disabled={unreadCount === 0}>
              全部标记为已读
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setSettingsOpen(true)}>通知设置</Button>
            <RestrictedAction label="接入企业微信推送" />
          </div>
        }
      />

      <StatGrid>
        <StatCard label="未读通知" value={unreadCount} />
        <StatCard label="待审批相关" value={notifications.filter((n) => n.category === "approval" && !n.read).length} />
        <StatCard label="安全相关" value={notifications.filter((n) => n.category === "security").length} />
        <StatCard label="通知总数" value={notifications.length} onClick={handleRefresh} />
      </StatGrid>

      <div style={{ marginTop: 16 }}>
        <Tabs tabs={CATEGORY_TABS} activeTab={category} onChange={setCategory} />
      </div>

      <div style={{ marginTop: 12 }}>
        <FilterBar activeFilters={activeFilters} onClearAll={() => setQuery("")}>
          <SearchField label="搜索通知" placeholder="按标题搜索" value={query} onChange={setQuery} />
        </FilterBar>
      </div>

      {failed ? (
        <div style={{ marginTop: 16 }}>
          <ErrorState message="通知列表刷新失败（演示环境模拟）" detail="GET /api/founder/notifications -> 503" onRetry={handleRefresh} />
        </div>
      ) : (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.length === 0 ? (
            <EmptyState message="暂无匹配的通知" action={query ? <Button size="sm" variant="secondary" onClick={() => setQuery("")}>清除搜索</Button> : null} />
          ) : (
            filtered.map((n) => (
              <div
                key={n.id}
                className="fdr-card"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, opacity: n.read ? 0.72 : 1 }}
              >
                <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setDetailId(n.id)}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                    {!n.read ? <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--action-primary)", display: "inline-block" }} /> : null}
                    <strong>{n.title}</strong>
                    <StatusPill tone={n.status}>{n.statusLabel}</StatusPill>
                    <span className="fdr-type-caption" style={{ color: "var(--text-tertiary)" }}>{NOTIFICATION_CATEGORY_LABEL[n.category]}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{n.meta}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <TextButton onClick={() => toggleRead(n.id)}>{n.read ? "标记未读" : "标记已读"}</TextButton>
                  <DrillDownLink module={n.linkedModule} subView={n.linkedSubView}>去处理</DrillDownLink>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <Drawer open={!!detailNotification} title={detailNotification?.title} onClose={() => setDetailId(null)}
        footer={detailNotification ? <DrillDownLink module={detailNotification.linkedModule} subView={detailNotification.linkedSubView}>前往来源模块</DrillDownLink> : null}
      >
        {detailNotification ? (
          <KeyValueList
            items={[
              { label: "分类", value: NOTIFICATION_CATEGORY_LABEL[detailNotification.category] },
              { label: "状态", value: detailNotification.statusLabel },
              { label: "阅读状态", value: detailNotification.read ? "已读" : "未读" },
              { label: "来源", value: detailNotification.meta },
            ]}
          />
        ) : null}
      </Drawer>

      <Modal
        open={settingsOpen}
        title="通知设置"
        onClose={() => setSettingsOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSettingsOpen(false)}>取消</Button>
            <Button variant="primary" onClick={saveSettings}>保存设置</Button>
          </>
        }
      >
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 0 }}>
          选择希望接收的通知类别（演示：仅影响本页展示，不接入真实推送渠道）。
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {Object.entries(NOTIFICATION_CATEGORY_LABEL).map(([key, label]) => (
            <Checkbox
              key={key}
              label={label}
              checked={categoryEnabled[key]}
              onChange={() => setCategoryEnabled((prev) => ({ ...prev, [key]: !prev[key] }))}
            />
          ))}
        </div>
      </Modal>
    </div>
  );
}
