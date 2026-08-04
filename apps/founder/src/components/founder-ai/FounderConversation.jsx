import { useCallback, useEffect, useMemo, useState } from "react";
import { FounderComposer } from "./FounderComposer.jsx";
import { NavIcon } from "./icons.jsx";
import { MultiModelBlock } from "./timeline-cards/MultiModelBlock.jsx";
import { DecisionDraftCard } from "./timeline-cards/DecisionDraftCard.jsx";
import { TaskPackageCard } from "./timeline-cards/TaskPackageCard.jsx";
import { ExecutionResultCard } from "./timeline-cards/ExecutionResultCard.jsx";
import { RetrospectiveCard } from "./timeline-cards/RetrospectiveCard.jsx";
import { KnowledgeCard } from "./timeline-cards/KnowledgeCard.jsx";
import { MissionApprovalCard } from "../developer-os/MissionApprovalCard.jsx";
import { createFounderDeveloperOSAdapter, RUN_LABELS } from "../developer-os/founderDeveloperOSAdapter.js";

const FOUNDER_NAME = "立行";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "上午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

function formatBriefingTime(value) {
  if (!value) return "等待首次同步";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function DailyBriefing({ compact = false }) {
  const developerOS = useMemo(() => createFounderDeveloperOSAdapter(), []);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSnapshot(await developerOS.refresh_state());
      setError(null);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, [developerOS]);

  useEffect(() => {
    let active = true;
    developerOS.refresh_state().then((nextSnapshot) => {
      if (active) {
        setSnapshot(nextSnapshot);
        setError(null);
        setLoading(false);
      }
    }).catch((nextError) => {
      if (active) {
        setError(nextError);
        setLoading(false);
      }
    });
    window.addEventListener("founder-developer-os:refresh", refresh);
    return () => {
      active = false;
      window.removeEventListener("founder-developer-os:refresh", refresh);
    };
  }, [developerOS, refresh]);

  const mission = snapshot?.mission;
  const run = snapshot?.run;
  const artifact = snapshot?.artifact;
  const commit = snapshot?.commit_result;
  const state = run?.state || "planning";
  const progress = snapshot?.sprint?.progress || run?.progress || (snapshot?.actions?.terminal ? 100 : 0);
  const waitingDecision = snapshot?.actions?.approve_execution
    ? `批准执行「${mission?.title || "今日 Mission"}」`
    : snapshot?.actions?.approve_commit
      ? `批准提交「${mission?.title || "当前开发成果"}」`
      : null;
  const resultTitle = commit
    ? `已提交 ${commit.committed_files?.length || 0} 个文件`
    : artifact
      ? artifact.diff_summary
      : "昨日暂无已归档研发成果";
  const resultDetail = commit
    ? `${commit.commit_message || "Developer OS 已完成提交"} · ${commit.branch || snapshot?.workspace?.branch || "当前分支"}`
    : artifact?.changed_files?.length
      ? `涉及 ${artifact.changed_files.length} 个文件，自动验收：${artifact.review_result === "passed" ? "通过" : "进行中"}`
      : "Developer OS 尚未返回可展示的成果记录。";
  const nextAction = waitingDecision
    ? waitingDecision
    : run && !snapshot?.actions?.terminal
      ? `跟进「${mission?.title || "当前 Mission"}」的执行状态`
      : mission
        ? `复盘「${mission.title}」并确定后续 Mission`
        : "向 Developer OS 获取今日推荐 Mission";
  const lastSyncedAt = snapshot?.workspace?.last_checked_at;
  const items = [
    { label: "昨日成果", title: resultTitle, detail: resultDetail },
    {
      label: "今日建议",
      title: mission?.title || (loading ? "正在读取 Developer OS…" : "暂无推荐 Mission"),
      detail: mission?.business_reason || (error?.suggestion || "Developer OS 尚未生成今日建议。"),
    },
    {
      label: "等待决策",
      title: waitingDecision || "当前无需 Founder 拍板",
      detail: waitingDecision ? `COO 建议：先确认风险与范围，再完成授权。当前状态：${RUN_LABELS[state] || state}` : "Sino 会在执行或提交需要授权时立即置顶。",
    },
    {
      label: "Sprint 进度",
      title: snapshot?.sprint?.title || "Developer OS Sprint",
      detail: `${Math.round(progress)}% · ${RUN_LABELS[state] || (loading ? "同步中" : "暂不可用")}`,
      progress,
    },
    {
      label: "下一最佳动作",
      title: nextAction,
      detail: waitingDecision ? "完成这一步即可解除当前推进阻塞。" : "这是基于当前 Mission、Run 与授权状态生成的建议。",
      featured: true,
    },
  ];

  return (
    <div className={`founder-daily-briefing${compact ? " is-compact" : ""}`}>
      <div className="founder-daily-briefing-heading">
        <div className="founder-daily-briefing-kicker">
          <span className="founder-daily-briefing-eyebrow">SINO · COO DAILY BRIEFING</span>
          <button type="button" onClick={refresh} disabled={loading}>{loading ? "同步中…" : "刷新数据"}</button>
        </div>
        <h1>Sino COO Daily Briefing</h1>
        <p>{getGreeting()}，{FOUNDER_NAME}。{error ? "Developer OS 暂时无法连接，请稍后刷新状态。" : "这是当前最值得你关注的经营与研发信号。"}</p>
        <div className="founder-daily-briefing-status" aria-label="Briefing 数据状态">
          <span className={`founder-daily-briefing-live${error ? " is-error" : ""}`}>
            <i aria-hidden="true" />
            {error ? "数据连接异常" : loading ? "正在同步" : "数据已同步"}
          </span>
          <span>{snapshot?.workspace?.name || "Developer OS"}</span>
          <span>{snapshot?.workspace?.branch ? `分支 ${snapshot.workspace.branch}` : "等待 Workspace"}</span>
          <span>更新于 {formatBriefingTime(lastSyncedAt)}</span>
        </div>
      </div>
      <div className="founder-daily-briefing-grid">
        {items.map((item, index) => (
          <article key={item.label} className={`founder-daily-briefing-card${item.featured ? " is-featured" : ""}`}>
            <div className="founder-daily-briefing-card-topline">
              <span className="founder-daily-briefing-index">0{index + 1}</span>
              <span>{item.label}</span>
            </div>
            <h2>{item.title}</h2>
            <p>{item.detail}</p>
            {item.progress !== undefined && (
              <div className="founder-daily-briefing-progress" aria-label={`Sprint 进度 ${Math.round(item.progress)}%`}>
                <span style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }} />
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

export function FounderConversation({ conversation, onSend, onDecisionAction, onTaskPackageAction, onReviewAction, onMissionAction, onMissionRefresh }) {
  if (!conversation) {
    return (
      <section className="founder-conversation is-briefing">
        <div className="founder-conversation-empty">
          <DailyBriefing />
        </div>
      </section>
    );
  }

  return (
    <section className="founder-conversation">
      <div className="founder-conversation-header">
        <h1>{conversation.title}</h1>
      </div>
      <div className="founder-conversation-scroll">
        {conversation.messages.length === 0 && (
          <div className="founder-conversation-empty-inline">
            <DailyBriefing compact />
          </div>
        )}
        {conversation.messages.map((entry) => {
          switch (entry.type) {
            case "user":
              return (
                <div key={entry.id} className="founder-conversation-bubble role-user">
                  {entry.attachments?.length > 0 && (
                    <div className="founder-conversation-attachments">
                      {entry.attachments.map((a) => (
                        <span key={a.id} className="founder-composer-attachment-chip">
                          <NavIcon name={a.kind === "image" ? "image" : "paperclip"} />
                          {a.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {entry.text}
                </div>
              );
            case "sino":
              return (
                <div key={entry.id} className="founder-conversation-bubble role-sino">
                  {entry.text}
                </div>
              );
            case "multi-model":
              return <MultiModelBlock key={entry.id} entry={entry} />;
            case "decision-draft":
              return <DecisionDraftCard key={entry.id} entry={entry} onAction={onDecisionAction} />;
            case "task-package":
              return <TaskPackageCard key={entry.id} entry={entry} onAction={onTaskPackageAction} />;
            case "execution":
              return <ExecutionResultCard key={entry.id} entry={entry} onReview={onReviewAction} />;
            case "retrospective":
              return <RetrospectiveCard key={entry.id} entry={entry} />;
            case "knowledge":
              return <KnowledgeCard key={entry.id} entry={entry} />;
            case "developer-mission-approval":
              return <MissionApprovalCard key={entry.id} entry={entry} onAction={onMissionAction} onRefresh={onMissionRefresh} />;
            default:
              return null;
          }
        })}
      </div>
      <FounderComposer onSend={onSend} />
    </section>
  );
}
