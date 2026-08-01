import { useState } from "react";

const VERDICT_LABEL = { pass: "通过", revise: "继续修改", reject: "驳回" };
const KIND_LABEL = { clarification: "Claude Code 需要澄清", authorization: "Claude Code 请求额外授权" };

export function ExecutionResultCard({ entry, onReview, onProvideInput, onCancel }) {
  const [expanded, setExpanded] = useState(false);
  const [answer, setAnswer] = useState("");
  const { run, result } = entry;

  // 等待用户澄清/授权：问题必须直接回到 Sino 对话里回答，不需要打开
  // Claude 手工处理。
  if (run?.awaitingInput) {
    return (
      <div className="sf-card timeline-card">
        <div className="founder-ai-row-header">
          <h4>{entry.pkgName}</h4>
          <span className="sf-badge warn">{KIND_LABEL[run.awaitingInputKind] || "等待你的回答"}</span>
        </div>
        <p>{run.awaitingInputQuestion}</p>
        <div className="founder-ai-actions" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
          <textarea
            className="founder-composer-textarea"
            rows={2}
            value={answer}
            placeholder="在这里直接回答，Claude Code 会继续原来的执行会话"
            onChange={(e) => setAnswer(e.target.value)}
          />
          <div className="founder-ai-actions">
            <button
              type="button"
              className="sf-button-primary"
              disabled={!answer.trim()}
              onClick={() => {
                onProvideInput?.(entry.id, answer.trim());
                setAnswer("");
              }}
            >
              提交回答
            </button>
            <button type="button" className="sf-icon-button" onClick={() => onCancel?.(entry.id)}>
              取消执行
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!result) {
    const isMock = run?.mock;
    return (
      <div className="sf-card timeline-card">
        <div className="founder-ai-row-header">
          <h4>已分配开发任务：{entry.pkgName}</h4>
          <span className="sf-badge warn">{isMock ? "Mock · 执行中" : "执行中"}</span>
        </div>
        <dl className="founder-ai-definition-grid">
          <dt>执行开始时间</dt>
          <dd>{run?.startedAt ? new Date(run.startedAt).toLocaleTimeString("zh-CN") : "—"}</dd>
          <dt>当前步骤</dt>
          <dd>{run?.currentStep || "准备中"}</dd>
        </dl>
        {run?.runId && (
          <div className="founder-ai-actions">
            <button type="button" className="sf-icon-button" onClick={() => onCancel?.(entry.id)}>
              取消执行
            </button>
          </div>
        )}
      </div>
    );
  }

  const isFailed = result.status === "failed";
  const isCancelled = result.status === "cancelled";
  const isMockResult = !!result.mock;

  return (
    <div className="sf-card timeline-card">
      <div className="founder-ai-row-header">
        <h4>{isFailed ? "执行未通过" : isCancelled ? "执行已取消" : `执行完成：${entry.pkgName}`}</h4>
        <span className={`sf-badge ${isFailed || isCancelled ? "danger" : entry.reviewVerdict ? "success" : "warn"}`}>
          {isMockResult ? "Mock" : entry.reviewVerdict ? VERDICT_LABEL[entry.reviewVerdict.verdict] : isFailed ? "失败" : isCancelled ? "已取消" : "待验收"}
        </span>
      </div>
      <p>{result.summary}</p>
      {result.pageUrl && (
        <p className="founder-ai-meta">
          页面地址：
          <a href={result.pageUrl} target="_blank" rel="noreferrer">
            {result.pageUrl}
          </a>
        </p>
      )}
      {result.screenshotUrl && (
        <img
          src={result.screenshotUrl}
          alt="执行结果页面截图"
          style={{ maxWidth: "100%", borderRadius: 8, marginTop: 8, border: "1px solid var(--sf-border, #333)" }}
        />
      )}
      <button type="button" className="sf-icon-button" onClick={() => setExpanded((v) => !v)}>
        {expanded ? "收起完整结果" : "查看完整结果"}
      </button>
      {expanded && (
        <dl className="founder-ai-definition-grid" style={{ marginTop: 10 }}>
          <dt>修改文件</dt>
          <dd>{result.filesChanged?.length ? result.filesChanged.join("；") : "无"}</dd>
          <dt>验证结果</dt>
          <dd>{result.testResults}</dd>
          <dt>已知问题</dt>
          <dd>{result.knownIssues}</dd>
          {result.commitHash && (
            <>
              <dt>Git commit</dt>
              <dd>{result.commitHash}</dd>
            </>
          )}
        </dl>
      )}
      {!isFailed && !isCancelled && !entry.reviewVerdict ? (
        <div className="founder-ai-actions">
          <button type="button" className="sf-button-primary" onClick={() => onReview(entry.id, "pass")}>
            通过
          </button>
          <button type="button" className="sf-icon-button" onClick={() => onReview(entry.id, "revise")}>
            继续修改
          </button>
          <button type="button" className="sf-icon-button" onClick={() => onReview(entry.id, "reject")}>
            驳回
          </button>
          {result.pageUrl && (
            <a className="sf-icon-button" href={result.pageUrl} target="_blank" rel="noreferrer">
              查看页面
            </a>
          )}
        </div>
      ) : entry.reviewVerdict ? (
        <p className="founder-ai-saved-note">验收结果：{VERDICT_LABEL[entry.reviewVerdict.verdict]}</p>
      ) : (isFailed || isCancelled) && (
        <div className="founder-ai-actions">
          <button type="button" className="sf-icon-button" onClick={() => onReview(entry.id, "revise")}>
            重新尝试
          </button>
        </div>
      )}
    </div>
  );
}
