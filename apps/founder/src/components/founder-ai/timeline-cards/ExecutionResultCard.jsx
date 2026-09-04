import { useState } from "react";

const VERDICT_LABEL = { pass: "通过", revise: "继续修改", reject: "驳回" };

export function ExecutionResultCard({ entry, onReview }) {
  const [expanded, setExpanded] = useState(false);
  const { run, result } = entry;

  if (!result) {
    return (
      <div className="sf-card timeline-card">
        <div className="founder-ai-row-header">
          <h4>已分配开发任务：{entry.pkgName}</h4>
          <span className="sf-badge warn">执行中</span>
        </div>
        <dl className="founder-ai-definition-grid">
          <dt>执行开始时间</dt>
          <dd>{new Date(run.startedAt).toLocaleTimeString("zh-CN")}</dd>
          <dt>当前步骤</dt>
          <dd>{run.currentStep}</dd>
          <dt>是否等待输入</dt>
          <dd>{run.awaitingInput ? "是" : "否"}</dd>
        </dl>
      </div>
    );
  }

  return (
    <div className="sf-card timeline-card">
      <div className="founder-ai-row-header">
        <h4>执行完成：{entry.pkgName}</h4>
        <span className={`sf-badge ${entry.reviewVerdict ? "success" : "warn"}`}>
          {entry.reviewVerdict ? VERDICT_LABEL[entry.reviewVerdict.verdict] : "待验收"}
        </span>
      </div>
      <p>{result.summary}</p>
      <p className="founder-ai-meta">
        页面地址：
        <a href={result.pageUrl} target="_blank" rel="noreferrer">
          {result.pageUrl}
        </a>
      </p>
      <button type="button" className="sf-icon-button" onClick={() => setExpanded((v) => !v)}>
        {expanded ? "收起完整结果" : "查看完整结果"}
      </button>
      {expanded && (
        <dl className="founder-ai-definition-grid" style={{ marginTop: 10 }}>
          <dt>修改文件</dt>
          <dd>{result.filesChanged.join("；")}</dd>
          <dt>测试结果</dt>
          <dd>{result.testResults}</dd>
          <dt>已知问题</dt>
          <dd>{result.knownIssues}</dd>
        </dl>
      )}
      {!entry.reviewVerdict ? (
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
          <a className="sf-icon-button" href={result.pageUrl} target="_blank" rel="noreferrer">
            查看页面
          </a>
        </div>
      ) : (
        <p className="founder-ai-saved-note">验收结果：{VERDICT_LABEL[entry.reviewVerdict.verdict]}</p>
      )}
    </div>
  );
}
