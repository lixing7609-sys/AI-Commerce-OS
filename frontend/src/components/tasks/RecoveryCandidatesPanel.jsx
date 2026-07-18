import { useCallback, useEffect, useRef, useState } from "react";

import {
  getRecoveryCandidates,
  markTaskFailed,
  requeueTask,
} from "../../services/taskApi";
import ConfirmDialog from "../common/ConfirmDialog";
import {
  formatDateTime,
  formatDuration,
  getRecommendedActionLabel,
  getRecoveryStatusLabel,
} from "./recoveryFormatters";

const POLL_INTERVAL_MS = 10000;
const PAGE_SIZE = 20;
const STALE_THRESHOLD_OPTIONS = [15, 30, 60, 120, 360];

const EMPTY_SUMMARY = {
  pending_count: 0,
  running_count: 0,
  stale_running_count: 0,
  total_candidates: 0,
  blocks_runtime_recovery: false,
  blocking_reason: "",
};

function mapRequeueErrorMessage(error) {
  if (error?.status === 409) {
    return "任务状态已发生变化，请刷新后重试";
  }

  if (error?.status === 404) {
    return "任务不存在或已被删除";
  }

  return "重新排队失败";
}

function mapMarkFailedErrorMessage(error) {
  if (error?.status === 422) {
    return "失败原因不符合要求";
  }

  if (error?.status === 409) {
    return "任务状态已发生变化，请刷新后重试";
  }

  if (error?.status === 404) {
    return "任务不存在或已被删除";
  }

  return "标记失败失败";
}

function RecoveryCandidatesPanel({ onTaskMutated = () => {}, onViewTask = () => {} }) {
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [items, setItems] = useState([]);
  const [candidatesLoading, setCandidatesLoading] = useState(true);
  const [candidatesError, setCandidatesError] = useState(null);

  const [statusFilter, setStatusFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [staleAfterMinutes, setStaleAfterMinutes] = useState(30);
  const [offset, setOffset] = useState(0);
  const [knownAgents, setKnownAgents] = useState([]);

  const [confirmDialog, setConfirmDialog] = useState(null);
  const [reasonInput, setReasonInput] = useState("");
  const [pendingAction, setPendingAction] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const mountedRef = useRef(true);
  const pendingActionRef = useRef(null);
  const requestSeqRef = useRef(0);
  const appliedSeqRef = useRef(0);

  useEffect(() => {
    pendingActionRef.current = pendingAction;
  }, [pendingAction]);

  useEffect(() => {
    if (!successMessage) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      if (mountedRef.current) {
        setSuccessMessage(null);
      }
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [successMessage]);

  const loadCandidates = useCallback(
    async (seq) => {
      try {
        const data = await getRecoveryCandidates({
          status: statusFilter === "all" ? undefined : statusFilter,
          assignedAgent: agentFilter === "all" ? undefined : agentFilter,
          staleAfterMinutes,
          limit: PAGE_SIZE,
          offset,
        });

        if (!mountedRef.current || seq <= appliedSeqRef.current) {
          return;
        }

        appliedSeqRef.current = seq;

        const nextItems = Array.isArray(data.items) ? data.items : [];

        setSummary(data.summary);
        setItems(nextItems);
        setCandidatesError(null);

        setKnownAgents((prev) => {
          const next = new Set(prev);

          nextItems.forEach((item) => {
            if (item.assigned_agent) {
              next.add(item.assigned_agent);
            }
          });

          return Array.from(next).sort();
        });

        // 当前页在筛选/翻页后变为空且不是第一页时，自动回退一页；
        // offset 变化会让 loadCandidates 的依赖变化，触发新一轮加载。
        if (nextItems.length === 0 && offset > 0) {
          setOffset((prev) => Math.max(0, prev - PAGE_SIZE));
        }
      } catch (err) {
        if (!mountedRef.current) {
          return;
        }

        console.error("异常任务候选清单加载失败：", err);
        setCandidatesError(err.message || "获取异常任务候选清单失败");
      } finally {
        if (mountedRef.current) {
          setCandidatesLoading(false);
        }
      }
    },
    [statusFilter, agentFilter, staleAfterMinutes, offset]
  );

  useEffect(() => {
    mountedRef.current = true;

    function pollTick() {
      if (pendingActionRef.current) {
        return;
      }

      loadCandidates(++requestSeqRef.current);
    }

    pollTick();

    const timer = window.setInterval(pollTick, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
    };
  }, [loadCandidates]);

  function handleFilterChange(nextStatus) {
    setStatusFilter(nextStatus);
    setOffset(0);
  }

  function handleAgentFilterChange(nextAgent) {
    setAgentFilter(nextAgent);
    setOffset(0);
  }

  function handleStaleThresholdChange(nextValue) {
    setStaleAfterMinutes(Number(nextValue));
  }

  function handlePrevPage() {
    setOffset((prev) => Math.max(0, prev - PAGE_SIZE));
  }

  function handleNextPage() {
    setOffset((prev) => prev + PAGE_SIZE);
  }

  function openRequeueConfirm(taskId) {
    if (pendingActionRef.current) {
      return;
    }

    setActionError(null);
    setConfirmDialog({ type: "requeue", taskId });
  }

  function openMarkFailedConfirm(taskId) {
    if (pendingActionRef.current) {
      return;
    }

    setActionError(null);
    setReasonInput("");
    setConfirmDialog({ type: "mark_failed", taskId });
  }

  function closeConfirmDialog() {
    if (pendingActionRef.current) {
      return;
    }

    setConfirmDialog(null);
    setReasonInput("");
  }

  async function handleConfirmAction() {
    if (!confirmDialog || pendingActionRef.current) {
      return;
    }

    const { type, taskId } = confirmDialog;
    const trimmedReason = reasonInput.trim();

    if (type === "mark_failed" && trimmedReason.length === 0) {
      return;
    }

    setPendingAction({ type, taskId });
    setActionError(null);

    try {
      if (type === "requeue") {
        await requeueTask(taskId);
        setSuccessMessage("任务已重新排队");
      } else {
        await markTaskFailed(taskId, trimmedReason);
        setSuccessMessage("任务已标记失败");
      }

      if (mountedRef.current) {
        setConfirmDialog(null);
        setReasonInput("");
      }

      await loadCandidates(++requestSeqRef.current);
      onTaskMutated();
    } catch (err) {
      console.error(
        `${type === "requeue" ? "重新排队" : "标记失败"}操作失败：`,
        err
      );

      const message =
        type === "requeue"
          ? mapRequeueErrorMessage(err)
          : mapMarkFailedErrorMessage(err);

      if (mountedRef.current) {
        setActionError(message);
        setConfirmDialog(null);
        setReasonInput("");
      }

      if (err?.status === 409) {
        await loadCandidates(++requestSeqRef.current);
      }
    } finally {
      if (mountedRef.current) {
        setPendingAction(null);
      }
    }
  }

  const isBusy = pendingAction !== null;
  const hasAnyCandidate = summary.total_candidates > 0;

  const confirmDisabled =
    confirmDialog?.type === "mark_failed" &&
    reasonInput.trim().length === 0;

  return (
    <section className="recovery-panel">
      <div className="recovery-panel-header">
        <span className="recovery-panel-title">异常任务处置</span>
      </div>

      <div
        className={`recovery-summary-banner${
          summary.blocks_runtime_recovery ? " blocked" : " normal"
        }`}
      >
        <div className="recovery-summary-counts">
          <span>
            待执行 <strong>{summary.pending_count}</strong>
          </span>
          <span>
            运行中 <strong>{summary.running_count}</strong>
          </span>
          <span>
            疑似中断 <strong>{summary.stale_running_count}</strong>
          </span>
          <span>
            是否阻止自动恢复{" "}
            <strong>{summary.blocks_runtime_recovery ? "是" : "否"}</strong>
          </span>
        </div>

        <p className="recovery-summary-reason">
          {summary.blocks_runtime_recovery
            ? "存在未完成任务，Runtime 自动恢复已被阻止"
            : summary.blocking_reason || "当前没有阻止自动恢复的未完成任务"}
        </p>
      </div>

      {candidatesError && (
        <div className="recovery-alert error">{candidatesError}</div>
      )}

      {actionError && <div className="recovery-alert error">{actionError}</div>}

      {successMessage && (
        <div className="recovery-alert success">{successMessage}</div>
      )}

      {!candidatesLoading && !hasAnyCandidate ? (
        <div className="recovery-empty">当前没有需要人工处置的未完成任务</div>
      ) : (
        <>
          <div className="recovery-filters">
            <label className="recovery-filter-field">
              <span>状态</span>
              <select
                value={statusFilter}
                onChange={(event) => handleFilterChange(event.target.value)}
              >
                <option value="all">全部</option>
                <option value="pending">待执行</option>
                <option value="running">运行中</option>
              </select>
            </label>

            <label className="recovery-filter-field">
              <span>AI 员工</span>
              <select
                value={agentFilter}
                onChange={(event) =>
                  handleAgentFilterChange(event.target.value)
                }
              >
                <option value="all">全部</option>
                {knownAgents.map((agent) => (
                  <option key={agent} value={agent}>
                    {agent}
                  </option>
                ))}
              </select>
            </label>

            <label className="recovery-filter-field">
              <span>疑似中断阈值</span>
              <select
                value={staleAfterMinutes}
                onChange={(event) =>
                  handleStaleThresholdChange(event.target.value)
                }
              >
                {STALE_THRESHOLD_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} 分钟
                  </option>
                ))}
              </select>
            </label>
          </div>

          {candidatesLoading ? (
            <div className="recovery-loading">正在加载异常任务……</div>
          ) : items.length === 0 ? (
            <div className="recovery-empty">当前筛选条件下没有匹配的任务</div>
          ) : (
            <div className="recovery-table-wrapper">
              <table className="recovery-table">
                <thead>
                  <tr>
                    <th>任务 ID</th>
                    <th>任务类型</th>
                    <th>AI 员工</th>
                    <th>状态</th>
                    <th>创建时间</th>
                    <th>启动时间</th>
                    <th>已持续时间</th>
                    <th>疑似中断</th>
                    <th>建议动作</th>
                    <th>操作</th>
                  </tr>
                </thead>

                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <button
                          type="button"
                          className="recovery-task-id-link"
                          onClick={() => onViewTask(item.id)}
                        >
                          {item.id}
                        </button>
                      </td>
                      <td>{item.task_type}</td>
                      <td>{item.assigned_agent ?? "—"}</td>
                      <td>
                        <span className={`recovery-status ${item.status}`}>
                          {getRecoveryStatusLabel(item.status)}
                        </span>
                      </td>
                      <td>{formatDateTime(item.created_at)}</td>
                      <td>{formatDateTime(item.started_at)}</td>
                      <td>{formatDuration(item.age_seconds)}</td>
                      <td>
                        {item.is_stale ? (
                          <span
                            className="recovery-stale-badge"
                            title={item.stale_reason ?? undefined}
                          >
                            疑似中断
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {item.recommended_actions
                          .map(getRecommendedActionLabel)
                          .join("、")}
                      </td>
                      <td className="recovery-row-actions">
                        {item.status === "running" && (
                          <button
                            type="button"
                            className="recovery-action-button secondary"
                            onClick={() => openRequeueConfirm(item.id)}
                            disabled={isBusy}
                          >
                            重新排队
                          </button>
                        )}

                        <button
                          type="button"
                          className="recovery-action-button danger"
                          onClick={() => openMarkFailedConfirm(item.id)}
                          disabled={isBusy}
                        >
                          标记失败
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="recovery-pagination">
            <button
              type="button"
              className="recovery-pagination-button"
              onClick={handlePrevPage}
              disabled={offset === 0}
            >
              上一页
            </button>

            <button
              type="button"
              className="recovery-pagination-button"
              onClick={handleNextPage}
              disabled={items.length < PAGE_SIZE}
            >
              下一页
            </button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmDialog !== null}
        loading={isBusy}
        danger={confirmDialog?.type === "mark_failed"}
        title={
          confirmDialog?.type === "requeue"
            ? "确认重新排队？"
            : "确认标记失败？"
        }
        message={
          confirmDialog?.type === "requeue"
            ? `任务 ${confirmDialog?.taskId} 将从"运行中"改为"待执行"。本操作不会立即重新执行任务，只会把任务重新放回等待队列。`
            : `任务 ${confirmDialog?.taskId} 将被人工标记为失败，此操作不会自动重试。`
        }
        confirmLabel={
          confirmDialog?.type === "requeue" ? "确认重新排队" : "确认标记失败"
        }
        showReasonInput={confirmDialog?.type === "mark_failed"}
        reasonValue={reasonInput}
        onReasonChange={setReasonInput}
        reasonPlaceholder="请输入失败原因"
        confirmDisabled={confirmDisabled}
        onConfirm={handleConfirmAction}
        onCancel={closeConfirmDialog}
      />
    </section>
  );
}

export default RecoveryCandidatesPanel;
