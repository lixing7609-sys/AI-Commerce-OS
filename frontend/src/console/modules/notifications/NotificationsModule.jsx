import { PageHeader, ActivityFeed, DemoBadge } from "../../kit/index.js";
import { getNotifications } from "../founderWorkspace/workspaceEntities.js";
import { DrillDownLink } from "../founderWorkspace/WorkspaceKit.jsx";

/**
 * Founder Workspace · Notifications — promoted from the sidebar bell's
 * hardcoded "暂无新通知" stub (ConsoleSidebar.jsx) to a full page
 * reading the same feed; the flyout becomes a live preview of this
 * page's data (Charter §3.1) rather than a separate hardcoded string.
 */
export function NotificationsModule() {
  const notifications = getNotifications();

  return (
    <div>
      <PageHeader title="Notifications" subtitle="全部活动通知——点击任意一条查看侧边栏快速预览的完整来源" actions={<DemoBadge />} />
      <div className="fdr-card">
        <ActivityFeed items={notifications} />
      </div>
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        {notifications.map((n) => (
          <div key={n.id} style={{ display: "flex", justifyContent: "flex-end" }}>
            <DrillDownLink module={n.linkedModule} subView={n.linkedSubView}>{n.title}</DrillDownLink>
          </div>
        ))}
      </div>
    </div>
  );
}
