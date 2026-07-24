import { useEffect, useState } from "react";

import ShopPicker from "../shops/ShopPicker";
import { getShops } from "../../services/shopApi";
import { submitTask } from "../../services/taskApi";
import {
  PRIORITY_OPTIONS,
  TASK_MAX_LENGTH,
  getPriorityLabel,
  getSubmitErrorMessage,
} from "./taskSubmitLabels";

/**
 * Dashboard 顶部的轻量“提交任务”面板。
 *
 * 只负责表单本身：Agent 由父组件通过 props 提供（复用 Dashboard
 * 已有的 /dashboard/summary 轮询数据，不发起新请求）；提交只入队
 * （POST /tasks/submit，202），不等待、不轮询该任务，也不自动
 * 启动 Runtime。组件始终保持挂载（父组件用 open 控制显示/隐藏，
 * 而不是条件渲染整个组件），因此收起后再展开时表单内容和成功
 * 提示都会保留，直到用户修改或再次提交。
 */
function TaskSubmitPanel({
  open,
  agents = [],
  runtimeRunning = false,
  initialAgent = "",
  onViewTask = () => {},
}) {
  const [selectedAgent, setSelectedAgent] = useState(initialAgent);
  const [taskText, setTaskText] = useState("");
  const [priority, setPriority] = useState("normal");
  const [shopId, setShopId] = useState(null);
  const [shops, setShops] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [successInfo, setSuccessInfo] = useState(null);

  // 店铺列表只在面板打开时拉取一次（不随 5 秒轮询重复请求）；
  // 阶段 8E 要求创建任务时必须显式选择具体店铺或"未绑定店铺"，
  // 因此这里需要真实店铺列表供用户选择。
  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    getShops({ status: "active" })
      .then((data) => {
        if (!cancelled) {
          setShops(data.items ?? []);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("店铺列表加载失败：", error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  // initialAgent 只在调用方指定的预选 Agent 发生变化时生效一次
  // （渲染期间对比上一次值，而不是在 useEffect 里同步
  // setState——写法与 TaskCenter 的 selectedTaskId 同步一致），
  // 不会覆盖用户在面板打开后自行做出的选择。
  const [appliedInitialAgent, setAppliedInitialAgent] = useState(initialAgent);

  if (open && initialAgent && initialAgent !== appliedInitialAgent) {
    setAppliedInitialAgent(initialAgent);
    setSelectedAgent(initialAgent);
  }

  if (!open) {
    return null;
  }

  const agentNames = agents.map((agent) => agent.name);
  const agentsAvailable = agentNames.length > 0;
  const selectedAgentStillExists =
    !selectedAgent || agentNames.includes(selectedAgent);

  const trimmedTask = taskText.trim();
  const taskTooLong = trimmedTask.length > TASK_MAX_LENGTH;

  const canSubmit =
    !submitting &&
    Boolean(selectedAgent) &&
    selectedAgentStillExists &&
    trimmedTask.length > 0 &&
    !taskTooLong;

  async function handleSubmit(event) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const result = await submitTask({
        assigned_agent: selectedAgent,
        task: trimmedTask,
        context: {},
        priority,
        shop_id: shopId,
      });

      setSuccessInfo(result);
      setTaskText("");
      setPriority("normal");
    } catch (error) {
      console.error("任务提交失败：", error);
      setSubmitError(getSubmitErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  function handleTaskTextChange(event) {
    setTaskText(event.target.value);
    setSuccessInfo(null);
  }

  function handleAgentChange(event) {
    setSelectedAgent(event.target.value);
    setSuccessInfo(null);
  }

  function handlePriorityChange(event) {
    setPriority(event.target.value);
    setSuccessInfo(null);
  }

  return (
    <section className="task-submit-panel">
      <form className="task-submit-form" onSubmit={handleSubmit}>
        <div className="task-submit-field">
          <label htmlFor="task-submit-agent">AI 员工</label>
          <select
            id="task-submit-agent"
            value={selectedAgent}
            onChange={handleAgentChange}
            disabled={submitting || !agentsAvailable}
          >
            <option value="">请选择 AI 员工</option>
            {agents.map((agent) => (
              <option key={agent.name} value={agent.name}>
                {agent.name}
              </option>
            ))}
          </select>

          {!agentsAvailable && (
            <p className="task-submit-field-hint">
              暂无可用 AI 员工，请稍后重试或检查后端服务
            </p>
          )}

          {agentsAvailable && !selectedAgentStillExists && (
            <p className="task-submit-field-hint warning">
              所选 AI 员工可能已不可用，请重新选择
            </p>
          )}
        </div>

        <div className="task-submit-field">
          <label htmlFor="task-submit-text">任务内容</label>
          <textarea
            id="task-submit-text"
            value={taskText}
            onChange={handleTaskTextChange}
            disabled={submitting}
            rows={2}
            placeholder="描述需要 AI 员工执行的任务"
          />
          <span
            className={`task-submit-char-count${taskTooLong ? " error" : ""}`}
          >
            {trimmedTask.length} / {TASK_MAX_LENGTH}
          </span>
        </div>

        <div className="task-submit-field">
          <label htmlFor="task-submit-priority">优先级</label>
          <select
            id="task-submit-priority"
            value={priority}
            onChange={handlePriorityChange}
            disabled={submitting}
          >
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="task-submit-field">
          <label htmlFor="task-submit-shop">目标店铺</label>
          <ShopPicker
            id="task-submit-shop"
            value={shopId}
            onChange={(value) => {
              setShopId(value);
              setSuccessInfo(null);
            }}
            shops={shops}
            disabled={submitting}
          />
          <p className="task-submit-field-hint">
            必须明确选择具体店铺，或保持"未绑定店铺"。
          </p>
        </div>

        <p className="task-submit-hint">
          {runtimeRunning
            ? "任务将由后台执行器异步处理"
            : "Runtime 当前已停止，任务将进入队列，并在 Runtime 启动后执行。"}
        </p>

        {submitError && (
          <div className="task-submit-alert error">{submitError}</div>
        )}

        <button type="submit" className="task-submit-button" disabled={!canSubmit}>
          {submitting ? "提交中…" : "提交任务"}
        </button>
      </form>

      {successInfo && (
        <div className="task-submit-success">
          <p className="task-submit-success-title">任务已进入执行队列</p>

          <dl className="task-submit-success-meta">
            <div>
              <dt>任务 ID</dt>
              <dd>{successInfo.id}</dd>
            </div>
            <div>
              <dt>AI 员工</dt>
              <dd>{successInfo.assigned_agent}</dd>
            </div>
            <div>
              <dt>优先级</dt>
              <dd>{getPriorityLabel(successInfo.priority)}</dd>
            </div>
            <div>
              <dt>当前状态</dt>
              <dd>等待执行</dd>
            </div>
          </dl>

          <button
            type="button"
            className="task-submit-view-button"
            onClick={() => onViewTask(successInfo.id)}
          >
            查看任务
          </button>
        </div>
      )}
    </section>
  );
}

export default TaskSubmitPanel;
