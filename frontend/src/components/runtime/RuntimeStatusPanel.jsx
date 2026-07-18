import { useCallback, useEffect, useRef, useState } from "react";

import {
  getRuntimeStatus,
  startRuntime,
  stopRuntime,
  updateAutoResume,
} from "../../services/runtimeApi";
import AutoResumeToggle from "./AutoResumeToggle";
import RuntimeStateBadge from "./RuntimeStateBadge";
import { RUNTIME_STATE_LABELS } from "./runtimeLabels";

const POLL_INTERVAL_MS = 5000;

// 心跳周期为 15 秒，取 3 倍作为“服务连接正常”的新鲜度阈值，
// 容忍一次轮询延迟或短暂抖动，避免频繁在 正常/未知 之间跳变。
const HEARTBEAT_FRESH_THRESHOLD_MS = 45000;

const AGENT_STATUS_LABELS = {
  running: "运行中",
  idle: "待机",
  stopped: "已停止",
  error: "异常",
};

const SHUTDOWN_TYPE_LABELS = {
  graceful: "正常关闭",
  unexpected: "异常退出",
  unknown: "未知",
};

const EMPTY_AGENTS = {
  total: 0,
  running: 0,
  idle: 0,
  stopped: 0,
  error: 0,
  items: [],
};

function formatDateTime(value) {
  if (!value) {
    return "暂无";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "无效时间";
  }

  const pad = (n) => String(n).padStart(2, "0");

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function getStateLabel(state) {
  return RUNTIME_STATE_LABELS[state] ?? "未知";
}

function getRecoveryLevel(count) {
  if (count >= 3) {
    return "danger";
  }

  if (count >= 1) {
    return "warning";
  }

  return "normal";
}

function getConnectionStatus(lastHeartbeatAt) {
  if (!lastHeartbeatAt) {
    return "unknown";
  }

  const heartbeatTime = new Date(lastHeartbeatAt).getTime();

  if (Number.isNaN(heartbeatTime)) {
    return "unknown";
  }

  const age = Date.now() - heartbeatTime;

  return age >= 0 && age <= HEARTBEAT_FRESH_THRESHOLD_MS ? "normal" : "unknown";
}

function hasObviousStateMismatch(status) {
  const actualRunning = status.actual_state === "running";

  if (status.running !== actualRunning) {
    return true;
  }

  if (
    status.desired_state === "running" &&
    (status.actual_state === "stopped" || status.actual_state === "error")
  ) {
    return true;
  }

  return false;
}

function RuntimeStatusPanel() {
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const mountedRef = useRef(true);
  const pendingActionRef = useRef(null);
  const requestSeqRef = useRef(0);
  const appliedSeqRef = useRef(0);

  useEffect(() => {
    pendingActionRef.current = pendingAction;
  }, [pendingAction]);

  const applyStatus = useCallback((data, seq) => {
    if (!mountedRef.current || seq <= appliedSeqRef.current) {
      return;
    }

    appliedSeqRef.current = seq;
    setStatus(data);
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    async function pollStatus() {
      if (pendingActionRef.current) {
        return;
      }

      const seq = ++requestSeqRef.current;

      try {
        const data = await getRuntimeStatus();

        if (!mountedRef.current) {
          return;
        }

        applyStatus(data, seq);
        setStatusError(null);
      } catch (error) {
        if (!mountedRef.current) {
          return;
        }

        console.error("Runtime 状态轮询失败：", error);
        setStatusError(error.message || "获取 Runtime 状态失败");
      }
    }

    const timer = window.setInterval(pollStatus, POLL_INTERVAL_MS);

    pollStatus();

    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
    };
  }, [applyStatus]);

  const runWriteAction = useCallback(
    async (actionKey, requestFn, failureMessage) => {
      if (pendingActionRef.current) {
        return;
      }

      setPendingAction(actionKey);
      setActionError(null);

      const seq = ++requestSeqRef.current;

      try {
        const data = await requestFn();

        applyStatus(data, seq);
      } catch (error) {
        if (mountedRef.current) {
          console.error(`${failureMessage}：`, error);
          setActionError(error.message || failureMessage);
        }
      } finally {
        if (mountedRef.current) {
          setPendingAction(null);
        }
      }
    },
    [applyStatus]
  );

  function handleStart() {
    runWriteAction("start", startRuntime, "启动系统失败");
  }

  function handleStop() {
    runWriteAction("stop", stopRuntime, "停止系统失败");
  }

  function handleAutoResumeChange(nextEnabled) {
    runWriteAction(
      "auto-resume",
      () => updateAutoResume(nextEnabled),
      "更新自动恢复设置失败"
    );
  }

  const isBusy = pendingAction !== null;
  const agents = status?.agents ?? EMPTY_AGENTS;
  const recoveryFailureCount = status?.recovery_failure_count ?? 0;
  const recoveryLevel = getRecoveryLevel(recoveryFailureCount);
  const connectionStatus = status ? getConnectionStatus(status.last_heartbeat_at) : "unknown";
  const stateMismatch = status ? hasObviousStateMismatch(status) : false;
  const agentsHealthy = status ? agents.total - agents.error : 0;

  const alerts = [];

  if (statusError) {
    alerts.push({ level: "error", text: `获取状态失败：${statusError}` });
  }

  if (actionError) {
    alerts.push({ level: "error", text: actionError });
  }

  if (status?.last_error) {
    alerts.push({ level: "error", text: `最近错误：${status.last_error}` });
  }

  if (recoveryFailureCount > 0) {
    alerts.push({
      level: recoveryLevel === "danger" ? "error" : "warning",
      text:
        recoveryLevel === "danger"
          ? `自动恢复已连续失败 ${recoveryFailureCount} 次，请人工检查`
          : `自动恢复失败 ${recoveryFailureCount} 次`,
    });
  }

  if (stateMismatch) {
    alerts.push({
      level: "warning",
      text: "系统状态出现不一致，建议刷新确认或联系技术人员",
    });
  }

  if (agents.error > 0) {
    alerts.push({ level: "error", text: `${agents.error} 个 AI 员工出现异常` });
  }

  return (
    <section className="runtime-panel">
      <div className="runtime-panel-header">
        <div className="runtime-panel-title">
          <span>AI 运营系统</span>
          <RuntimeStateBadge state={status?.actual_state} />
        </div>

        <div className="runtime-panel-actions">
          <button
            type="button"
            className="runtime-action-button start"
            onClick={handleStart}
            disabled={isBusy}
          >
            {pendingAction === "start" ? "正在启动…" : "启动系统"}
          </button>

          <button
            type="button"
            className="runtime-action-button stop"
            onClick={handleStop}
            disabled={isBusy}
          >
            {pendingAction === "stop" ? "正在停止…" : "停止系统"}
          </button>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="runtime-alerts">
          {alerts.map((alert) => (
            <div key={alert.text} className={`runtime-alert ${alert.level}`}>
              {alert.text}
            </div>
          ))}
        </div>
      )}

      {!status ? (
        <div className="runtime-panel-loading">正在加载 AI 运营系统状态…</div>
      ) : (
        <>
          <div className="runtime-summary-row">
            <div className="runtime-summary-item">
              <span className="runtime-summary-label">AI 员工</span>
              <strong>
                {agentsHealthy}/{agents.total} 正常
                {agents.error > 0 ? `，${agents.error} 异常` : ""}
              </strong>
            </div>

            <div className="runtime-summary-item">
              <span className="runtime-summary-label">服务连接</span>
              <strong className={`runtime-connection ${connectionStatus}`}>
                {connectionStatus === "normal" ? "正常" : "未知"}
              </strong>
            </div>

            <div className="runtime-summary-item runtime-auto-resume-item">
              <span className="runtime-summary-label">自动恢复</span>
              <AutoResumeToggle
                checked={Boolean(status.auto_resume_enabled)}
                disabled={isBusy}
                loading={pendingAction === "auto-resume"}
                onChange={handleAutoResumeChange}
              />
            </div>
          </div>

          <p className="runtime-auto-resume-hint">
            后端重启后自动恢复 AI 运营系统
          </p>

          <button
            type="button"
            className="runtime-details-toggle"
            onClick={() => setDetailsOpen((open) => !open)}
            aria-expanded={detailsOpen}
          >
            {detailsOpen ? "收起运行详情 ▲" : "查看运行详情 ▼"}
          </button>

          {detailsOpen && (
            <div className="runtime-details">
              <div className="runtime-detail-row">
                <span>内存状态</span>
                <strong>{status.running ? "running" : "stopped"}</strong>
              </div>

              <div className="runtime-detail-row">
                <span>用户期望状态 desired_state</span>
                <strong>{getStateLabel(status.desired_state)}</strong>
              </div>

              <div className="runtime-detail-row">
                <span>持久化实际状态 actual_state</span>
                <strong>{getStateLabel(status.actual_state)}</strong>
              </div>

              <div className="runtime-detail-row">
                <span>上次启动时间</span>
                <strong>{formatDateTime(status.last_started_at)}</strong>
              </div>

              <div className="runtime-detail-row">
                <span>上次停止时间</span>
                <strong>{formatDateTime(status.last_stopped_at)}</strong>
              </div>

              <div className="runtime-detail-row">
                <span>最后服务心跳</span>
                <strong>{formatDateTime(status.last_heartbeat_at)}</strong>
              </div>

              <div className="runtime-detail-row">
                <span>最后关闭类型</span>
                <strong>
                  {SHUTDOWN_TYPE_LABELS[status.last_shutdown_type] ?? "未知"}
                </strong>
              </div>

              <div className="runtime-detail-row">
                <span>状态更新时间</span>
                <strong>{formatDateTime(status.updated_at)}</strong>
              </div>

              <div className="runtime-detail-row">
                <span>自动恢复失败次数</span>
                <strong>{recoveryFailureCount}</strong>
              </div>

              <p className="runtime-detail-hint">
                服务心跳用于确认后端服务仍在正常运行。
              </p>

              <div className="runtime-detail-agents">
                {agents.items.map((agent) => (
                  <div className="runtime-agent-row" key={agent.name}>
                    <span>{agent.name}</span>
                    <em className={`runtime-agent-status ${agent.status}`}>
                      {AGENT_STATUS_LABELS[agent.status] ?? "未知"}
                    </em>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default RuntimeStatusPanel;
