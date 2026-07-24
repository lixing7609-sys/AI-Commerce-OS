import { useState } from "react";

import ShopPicker from "../shops/ShopPicker";
import { createFollowUpTask } from "../../services/deliverableApi";

const PRIORITY_OPTIONS = [
  { value: "high", label: "高" },
  { value: "normal", label: "普通" },
  { value: "low", label: "低" },
];

/**
 * "基于成果创建任务"弹窗（阶段 8E）。
 *
 * 只有用户点击"创建任务"按钮后才会真正调用后端创建任务——弹窗
 * 打开、切换店铺、修改文案都不会触发任何写操作。默认继承成果的
 * shop_id；用户取消勾选"继承当前店铺范围"后可以显式更换目标
 * 店铺，此时前端明确展示"已更换为其它店铺"提示，不做静默切换。
 */
function CreateFollowUpTaskDialog({ deliverable, shops, agents, onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [assignedAgent, setAssignedAgent] = useState("");
  const [instruction, setInstruction] = useState("");
  const [priority, setPriority] = useState("normal");
  const [inheritShopScope, setInheritShopScope] = useState(true);
  const [targetShopId, setTargetShopId] = useState(deliverable.shop_id);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successInfo, setSuccessInfo] = useState(null);

  const trimmedTitle = title.trim();
  const canSubmit = trimmedTitle.length > 0 && assignedAgent && !submitting;

  const effectiveShopId = inheritShopScope ? deliverable.shop_id : targetShopId;
  const shopChanged = !inheritShopScope && targetShopId !== deliverable.shop_id;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      const result = await createFollowUpTask(deliverable.id, {
        title: trimmedTitle,
        assigned_agent: assignedAgent,
        instruction,
        priority,
        inherit_shop_scope: inheritShopScope,
        target_shop_id: inheritShopScope ? null : targetShopId,
      });
      setSuccessInfo(result);
      onCreated?.();
    } catch (err) {
      console.error("创建后续任务失败：", err);
      setError("创建任务失败，请检查填写内容后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="confirm-dialog-overlay" onClick={onClose}>
      <div
        className="confirm-dialog follow-up-task-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="基于成果创建任务"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="confirm-dialog-title">基于成果创建任务</h3>

        {successInfo ? (
          <div className="task-submit-success">
            <p className="task-submit-success-title">
              任务已创建：{successInfo.task_id}
            </p>
            <button type="button" className="os-btn primary" onClick={onClose}>
              关闭
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <div className="shop-form-alert error">{error}</div>}

            <div className="shop-form-field">
              <label htmlFor="follow-up-title">任务标题</label>
              <input
                id="follow-up-title"
                value={title}
                maxLength={64}
                onChange={(event) => setTitle(event.target.value)}
                disabled={submitting}
                placeholder="例如：制定小样本销售验证方案"
              />
            </div>

            <div className="shop-form-field">
              <label htmlFor="follow-up-agent">指派 AI 员工</label>
              <select
                id="follow-up-agent"
                value={assignedAgent}
                onChange={(event) => setAssignedAgent(event.target.value)}
                disabled={submitting}
              >
                <option value="">请选择 AI 员工</option>
                {agents.map((agent) => (
                  <option key={agent.name} value={agent.name}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="shop-form-field">
              <label htmlFor="follow-up-instruction">补充指令</label>
              <textarea
                id="follow-up-instruction"
                value={instruction}
                maxLength={2000}
                rows={3}
                onChange={(event) => setInstruction(event.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="shop-form-field">
              <label htmlFor="follow-up-priority">优先级</label>
              <select
                id="follow-up-priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
                disabled={submitting}
              >
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="shop-form-field">
              <label>
                <input
                  type="checkbox"
                  checked={inheritShopScope}
                  onChange={(event) => setInheritShopScope(event.target.checked)}
                  disabled={submitting}
                />{" "}
                继承当前店铺范围
              </label>
            </div>

            {!inheritShopScope && (
              <div className="shop-form-field">
                <label htmlFor="follow-up-shop">目标店铺</label>
                <ShopPicker
                  id="follow-up-shop"
                  value={targetShopId}
                  onChange={setTargetShopId}
                  shops={shops}
                  disabled={submitting}
                />
                {shopChanged && (
                  <p className="shop-form-hint warning">
                    已更换为与来源成果不同的店铺，请确认这是有意为之的操作。
                  </p>
                )}
              </div>
            )}

            <p className="shop-form-hint">
              新任务将绑定店铺：
              {effectiveShopId
                ? shops.find((s) => s.id === effectiveShopId)?.shop_name ?? effectiveShopId
                : "未绑定店铺"}
            </p>

            <div className="confirm-dialog-actions">
              <button type="button" className="confirm-dialog-button cancel" onClick={onClose} disabled={submitting}>
                取消
              </button>
              <button type="submit" className="confirm-dialog-button confirm" disabled={!canSubmit}>
                {submitting ? "创建中…" : "创建任务"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default CreateFollowUpTaskDialog;
