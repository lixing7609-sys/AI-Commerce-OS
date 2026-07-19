import { useEffect } from "react";

import {
  formatDateTime,
  getTaskDetailStatusLabel,
  sanitizeTaskDetail,
} from "./taskDetailHelpers";

/**
 * 从右侧滑出的任务详情抽屉。
 *
 * 只接收已经过 sanitizeTaskDetail() 处理（或原始 task 由本组件内部
 * 处理）的数据；不展示 payload/context，不使用
 * dangerouslySetInnerHTML，result/error 均为限长纯文本。
 *
 * 抽屉本身不发起任何请求、不做轮询——内容完全由父组件
 * （TaskCenter）传入的 task 驱动，TaskCenter 现有 5 秒 polling
 * 刷新任务列表后，只要把最新的任务对象重新传入即可让抽屉内容
 * 自动同步更新。
 */
function TaskDetailDrawer({
  open,
  task,
  loading = false,
  notFound = false,
  onClose = () => {},
}) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const detail = sanitizeTaskDetail(task);

  function handleOverlayClick() {
    onClose();
  }

  return (
    <div className="task-drawer-overlay" onClick={handleOverlayClick}>
      <aside
        className="task-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="任务详情"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="task-drawer-header">
          <span>任务详情</span>
          <button
            type="button"
            className="task-drawer-close"
            onClick={onClose}
            aria-label="关闭任务详情"
          >
            ✕
          </button>
        </div>

        <div className="task-drawer-body">
          {loading && !detail && (
            <div className="task-drawer-placeholder">
              正在加载任务详情…
            </div>
          )}

          {!loading && notFound && !detail && (
            <div className="task-drawer-placeholder">
              该任务暂未出现在当前列表中，请稍后刷新。
            </div>
          )}

          {detail && (
            <>
              <div className="task-drawer-status-row">
                <span
                  className={`task-drawer-status ${detail.status}`}
                >
                  {getTaskDetailStatusLabel(detail.status)}
                </span>
                <span className="task-drawer-id">{detail.id}</span>
              </div>

              <dl className="task-drawer-meta">
                <div>
                  <dt>AI 员工</dt>
                  <dd>{detail.assignedAgent ?? "—"}</dd>
                </div>
                <div>
                  <dt>任务类型</dt>
                  <dd>{detail.taskType || "—"}</dd>
                </div>
                <div>
                  <dt>优先级</dt>
                  <dd>{detail.priority}</dd>
                </div>
                <div>
                  <dt>创建时间</dt>
                  <dd>{formatDateTime(detail.createdAt)}</dd>
                </div>
                <div>
                  <dt>开始时间</dt>
                  <dd>{formatDateTime(detail.startedAt)}</dd>
                </div>
                <div>
                  <dt>完成时间</dt>
                  <dd>{formatDateTime(detail.completedAt)}</dd>
                </div>
                <div>
                  <dt>最近更新时间</dt>
                  <dd>{formatDateTime(detail.updatedAt)}</dd>
                </div>
              </dl>

              <h4>执行结果</h4>
              <pre className="task-drawer-json">{detail.resultText}</pre>

              <h4>错误信息</h4>
              <pre className="task-drawer-json">{detail.errorText}</pre>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

export default TaskDetailDrawer;
