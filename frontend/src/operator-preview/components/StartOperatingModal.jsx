import { useEffect, useState } from "react";

const PROGRESS_STEPS = [
  "准备数据",
  "AI CEO分析",
  "销售检查",
  "商品检查",
  "生成今日建议",
];

const STEP_INTERVAL_MS = 700;

/**
 * "一键开始运营"确认弹窗 + 原型演示流程（阶段：产品原型）。
 *
 * confirm 阶段展示"AI 将读取哪些数据 / 哪些尚未接入"，用户点击
 * "开始运营"后进入 progress 阶段（纯前端定时器驱动的演示动画，
 * 不调用任何后端接口，不触发真实任务），最终进入 done 阶段。
 */
function StartOperatingModal({ scopeLabel, connectedShopsCount, notConnectedAreas, onClose, onViewAdvice, onGoSecretary }) {
  const [phase, setPhase] = useState("confirm"); // confirm | progress | done
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (phase !== "progress") return undefined;

    if (stepIndex >= PROGRESS_STEPS.length - 1) {
      const timer = window.setTimeout(() => setPhase("done"), STEP_INTERVAL_MS);
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => setStepIndex((value) => value + 1), STEP_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [phase, stepIndex]);

  function handleStart() {
    setPhase("progress");
    setStepIndex(0);
  }

  return (
    <div className="op-modal-overlay" onClick={phase === "progress" ? undefined : onClose}>
      <div
        className="op-modal start-operating-modal"
        role="dialog"
        aria-modal="true"
        aria-label="开始今日AI运营"
        onClick={(event) => event.stopPropagation()}
      >
        {phase === "confirm" && (
          <>
            <h3>开始今日AI运营</h3>
            <p className="op-modal-subtitle">原型演示，尚未触发真实运营任务。</p>

            <dl className="op-modal-meta">
              <div>
                <dt>当前店铺范围</dt>
                <dd>{scopeLabel}</dd>
              </div>
              <div>
                <dt>AI 将读取哪些真实数据</dt>
                <dd>{connectedShopsCount} 个已授权店铺的任务与成果记录</dd>
              </div>
              <div>
                <dt>哪些数据尚未接入</dt>
                <dd>{notConnectedAreas.join("、")}</dd>
              </div>
              <div>
                <dt>预计进行</dt>
                <dd>经营分析、商品机会检查、销售机会检查、异常检查、生成今日建议</dd>
              </div>
            </dl>

            <div className="op-modal-actions">
              <button type="button" className="op-btn" onClick={onClose}>
                暂不开始
              </button>
              <button type="button" className="op-btn primary" onClick={handleStart}>
                开始运营
              </button>
            </div>
          </>
        )}

        {phase === "progress" && (
          <>
            <h3>今日AI运营进行中</h3>
            <p className="op-modal-subtitle">原型演示流程，不代表真实运营任务执行进度。</p>

            <ol className="op-progress-steps">
              {PROGRESS_STEPS.map((step, index) => (
                <li
                  key={step}
                  className={
                    index < stepIndex
                      ? "done"
                      : index === stepIndex
                      ? "active"
                      : "pending"
                  }
                >
                  <span className="op-progress-dot" />
                  {step}
                </li>
              ))}
            </ol>
          </>
        )}

        {phase === "done" && (
          <>
            <h3>今日经营分析已生成</h3>
            <p className="op-modal-subtitle">原型演示，尚未触发真实运营任务。</p>

            <div className="op-modal-actions">
              <button
                type="button"
                className="op-btn"
                onClick={() => {
                  onClose();
                  onGoSecretary();
                }}
              >
                进入AI秘书处
              </button>
              <button
                type="button"
                className="op-btn primary"
                onClick={() => {
                  onClose();
                  onViewAdvice();
                }}
              >
                查看今日建议
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default StartOperatingModal;
