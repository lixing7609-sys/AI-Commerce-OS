import { useEffect, useState } from "react";

import Sidebar from "../components/layout/Sidebar";
import RecoveryCandidatesPanel from "../components/tasks/RecoveryCandidatesPanel";
import TaskDetailDrawer from "../components/tasks/TaskDetailDrawer";
import ShopScopeSelector from "../components/shops/ShopScopeSelector";
import { getTasks, getTaskStats } from "../services/api";
import { getShops } from "../services/shopApi";
import { getTask } from "../services/taskApi";
import {
  getStoredShopScope,
  setStoredShopScope,
  shopScopeToQueryParams,
} from "../store/shopScopeStore";

const STATUS_LABELS = {
  pending: "待处理",
  running: "执行中",
  completed: "已完成",
  failed: "失败",
};

const FILTERS = [
  { value: "all", label: "全部" },
  { value: "pending", label: "待处理" },
  { value: "running", label: "执行中" },
  { value: "completed", label: "已完成" },
  { value: "failed", label: "失败" },
];

function getStatusLabel(status) {
  return STATUS_LABELS[status] ?? status;
}

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString();
}

function TaskCenter({ onNavigate = () => {}, selectedTaskId = null }) {
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
  });

  const [taskList, setTaskList] = useState({
    items: [],
    pagination: {
      limit: 50,
      offset: 0,
      returned: 0,
      filtered_total: 0,
    },
  });

  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 全局店铺范围（阶段 8E）：初值来自 localStorage 偏好，切换后
  // 立即持久化，影响本页任务列表的 shop_id/unassigned_shop 过滤。
  const [shopScope, setShopScope] = useState(() => getStoredShopScope());
  const [shops, setShops] = useState([]);

  useEffect(() => {
    let cancelled = false;
    getShops({ status: "active" })
      .then((data) => {
        if (!cancelled) setShops(data.items ?? []);
      })
      .catch((err) => console.error("店铺列表加载失败：", err));
    return () => {
      cancelled = true;
    };
  }, []);

  function handleShopScopeChange(nextScope) {
    setShopScope(nextScope);
    setStoredShopScope(nextScope);
  }

  // 任务详情抽屉：activeTaskId 决定"正在看哪个任务"（用于高亮，
  // 抽屉关闭后仍保留，做轻微高亮）；drawerOpen 单独控制抽屉本身
  // 是否展开——两者分离是为了满足"用户手动关闭后，后续 5 秒
  // polling 不应再次强制打开"的要求：polling 只会更新任务列表，
  // 从不触碰 drawerOpen。
  //
  // fetchedTaskData 只保存"在当前列表中找不到、单独 GET 回来"的
  // 兜底结果；只要任务本身在列表里，展示数据始终直接从
  // taskList.items 派生（渲染时计算，不额外存一份状态），避免和
  // polling 更新的列表数据产生不同步。
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [fetchedTaskData, setFetchedTaskData] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fetchNotFound, setFetchNotFound] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  // 父子任务委派信息（children/parent_summary）只存在于单条详情
  // 接口的响应里，列表接口出于避免 5 秒轮询触发额外查询的考虑
  // 故意不带这两个字段（只带轻量的 child_task_count）。因此这里
  // 单独用一次性 GET（不随 5 秒轮询重复请求）获取这部分数据，
  // 再与 listMatch/fetchedTaskData 提供的实时状态字段合并展示，
  // 不影响原有"列表轮询驱动抽屉内容更新"的行为。
  const [delegationExtras, setDelegationExtras] = useState(null);

  const [refreshTick, setRefreshTick] = useState(0);

  // 只在父组件传入的 selectedTaskId 变化时自动定位并打开一次抽屉
  // （Dashboard "查看任务" 跳转过来时触发）。用"渲染期间对比上一次
  // prop 值"的方式实现，而不是在 useEffect 里同步 setState——避免
  // 触发 react-hooks/set-state-in-effect（该模式是 React 官方推荐
  // 的"根据 prop 变化重置 state"写法）。
  const [prevSelectedTaskId, setPrevSelectedTaskId] = useState(null);

  if (selectedTaskId && selectedTaskId !== prevSelectedTaskId) {
    setPrevSelectedTaskId(selectedTaskId);
    setActiveTaskId(selectedTaskId);
    setDrawerOpen(true);
    setFetchedTaskData(null);
    setFetchNotFound(false);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const [tasksData, statsData] = await Promise.all([
          getTasks({
            status: statusFilter === "all" ? undefined : statusFilter,
            limit: 50,
            offset: 0,
            ...shopScopeToQueryParams(shopScope),
          }),
          getTaskStats(),
        ]);

        if (cancelled) {
          return;
        }

        const items = Array.isArray(tasksData.items) ? tasksData.items : [];

        setTaskList({
          items,
          pagination: {
            limit: tasksData.pagination?.limit ?? 50,
            offset: tasksData.pagination?.offset ?? 0,
            returned: tasksData.pagination?.returned ?? 0,
            filtered_total: tasksData.pagination?.filtered_total ?? 0,
          },
        });

        setStats({
          total: statsData.total ?? 0,
          pending: statsData.pending ?? 0,
          running: statsData.running ?? 0,
          completed: statsData.completed ?? 0,
          failed: statsData.failed ?? 0,
        });

        setError(null);
      } catch (err) {
        if (!cancelled) {
          console.error("任务中心数据加载失败：", err);
          setError(err.message || "任务数据加载失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    const timer = window.setInterval(loadData, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [statusFilter, refreshTick, shopScope]);

  const listMatch = activeTaskId
    ? taskList.items.find((item) => item.id === activeTaskId) ?? null
    : null;

  // activeTaskId 在当前列表中找不到时，最多单独 GET 一次；一旦
  // 已经拿到明确结果（找到了，或确认 404）就不再重复请求——用
  // fetchNotFound/fetchedTaskData 这两个 state 本身作为"是否已经
  // 请求过"的判断依据，而不是额外的 ref 计数器：React 18
  // StrictMode 开发模式下会把 effect 挂载-卸载-再挂载各跑一次，
  // 如果用 ref 记录"已尝试过"，第一次（会被立即撤销的）调用会
  // 抢先标记为"已尝试"，导致第二次（真正生效的）调用直接被guard
  // 跳过，而第一次调用的结果又因为 cancelled 被丢弃，最终两次
  // 都拿不到结果。用 state 判断则没有这个问题：第二次调用发起时
  // state 还没被第一次调用更新，会正常请求并正确写回结果。
  // 一旦任务出现在列表中，上面的 listMatch 会直接命中，这个
  // effect 不再做任何事——不会陷入无限请求，也不会用旧的单独
  // 请求结果覆盖新的列表数据。
  useEffect(() => {
    if (!activeTaskId || listMatch) {
      return undefined;
    }

    if (fetchNotFound || fetchedTaskData?.id === activeTaskId) {
      return undefined;
    }

    let cancelled = false;

    async function fetchOnce() {
      setDetailLoading(true);

      try {
        const detail = await getTask(activeTaskId);

        if (cancelled) {
          return;
        }

        setFetchedTaskData(detail);
        setFetchNotFound(false);
      } catch (err) {
        if (cancelled) {
          return;
        }

        console.error("任务详情单独获取失败：", err);
        setFetchNotFound(true);
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    fetchOnce();

    return () => {
      cancelled = true;
    };
  }, [activeTaskId, listMatch, fetchNotFound, fetchedTaskData]);

  useEffect(() => {
    if (!activeTaskId) {
      return undefined;
    }

    let cancelled = false;

    async function loadDelegationExtras() {
      try {
        const detail = await getTask(activeTaskId);

        if (cancelled) {
          return;
        }

        setDelegationExtras({
          taskId: activeTaskId,
          children: detail.children,
          parent_summary: detail.parent_summary,
        });
      } catch (err) {
        if (!cancelled) {
          // 委派关系是详情展示的增强信息，获取失败不影响主详情
          // （状态/结果/错误信息）正常展示，只静默记录日志。
          console.error("委派关系加载失败：", err);
        }
      }
    }

    loadDelegationExtras();

    return () => {
      cancelled = true;
    };
  }, [activeTaskId]);

  function refreshTaskCenterData() {
    setRefreshTick((tick) => tick + 1);
  }

  function handleSelectTask(taskId) {
    setActiveTaskId(taskId);
    setDrawerOpen(true);
    setFetchedTaskData(null);
    setFetchNotFound(false);
  }

  function handleCloseDrawer() {
    setDrawerOpen(false);
  }

  const drawerTaskBase =
    listMatch ??
    (fetchedTaskData && fetchedTaskData.id === activeTaskId
      ? fetchedTaskData
      : null);

  const drawerTask =
    drawerTaskBase && delegationExtras?.taskId === drawerTaskBase.id
      ? {
          ...drawerTaskBase,
          children: delegationExtras.children,
          parent_summary: delegationExtras.parent_summary,
        }
      : drawerTaskBase;

  const drawerNotFound = fetchNotFound && !drawerTask;

  return (
    <div className="dashboard-shell">
      <Sidebar
        activePage="tasks"
        onNavigate={onNavigate}
        statusLabel={error ? "任务数据异常" : "任务中心正常"}
        statusOk={!error}
      />

      <main className="dashboard-workspace task-workspace">
        <header className="workspace-header">
          <div>
            <h1>任务中心</h1>
            <p>查看全部 AI 员工任务的执行状态与结果</p>
          </div>
          <ShopScopeSelector value={shopScope} onChange={handleShopScopeChange} shops={shops} />
        </header>

        <div className="task-scroll-area">
          {error && <div className="task-error">{error}</div>}

          <section className="task-summary-grid">
            <article className="task-summary-card">
              <span>全部</span>
              <strong>{stats.total}</strong>
            </article>

            <article className="task-summary-card">
              <span>待处理</span>
              <strong>{stats.pending}</strong>
            </article>

            <article className="task-summary-card">
              <span>执行中</span>
              <strong>{stats.running}</strong>
            </article>

            <article className="task-summary-card">
              <span>已完成</span>
              <strong>{stats.completed}</strong>
            </article>

            <article className="task-summary-card">
              <span>失败</span>
              <strong>{stats.failed}</strong>
            </article>
          </section>

          <RecoveryCandidatesPanel
            onTaskMutated={refreshTaskCenterData}
            onViewTask={handleSelectTask}
          />

          <div className="task-filter-tabs">
            {FILTERS.map((filter) => (
              <button
                key={filter.value}
                className={`task-filter-button${
                  statusFilter === filter.value ? " active" : ""
                }`}
                onClick={() => setStatusFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="task-loading">正在加载任务……</div>
          ) : taskList.items.length === 0 ? (
            <div className="task-empty">暂无符合条件的任务</div>
          ) : (
            <div className="task-list">
              {taskList.items.map((task) => {
                const isActive = activeTaskId === task.id;

                return (
                  <div
                    key={task.id}
                    className={`task-row${
                      isActive && drawerOpen ? " active" : ""
                    }${isActive && !drawerOpen ? " recently-viewed" : ""}`}
                    onClick={() => handleSelectTask(task.id)}
                  >
                    <span>{task.id}</span>
                    <span>
                      {task.task_type}
                      {task.child_task_count > 0 && (
                        <em className="task-delegation-badge">
                          已委派 {task.child_task_count}
                        </em>
                      )}
                      {task.created_by_agent && (
                        <em className="task-delegation-badge child">
                          由 {task.created_by_agent} 委派
                        </em>
                      )}
                    </span>
                    <span>{task.assigned_agent ?? "—"}</span>
                    <span className="task-shop-cell">
                      {task.shop_name || "未绑定店铺"}
                    </span>
                    <span className={`task-status ${task.status}`}>
                      {getStatusLabel(task.status)}
                    </span>
                    <span>{formatDateTime(task.created_at)}</span>
                    <span>{formatDateTime(task.completed_at)}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="task-pagination-hint">
            当前显示 {taskList.pagination.returned} 条，共{" "}
            {taskList.pagination.filtered_total} 条
          </div>
        </div>
      </main>

      <TaskDetailDrawer
        open={drawerOpen}
        task={drawerTask}
        loading={detailLoading}
        notFound={drawerNotFound}
        onClose={handleCloseDrawer}
        onNavigateToTask={handleSelectTask}
      />
    </div>
  );
}

export default TaskCenter;
