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

function displayEvidence(value) {
  if (value === undefined || value === null || value === "" || value === "unavailable") return "暂无记录";
  if (typeof value === "boolean") return value ? "通过" : "未通过";
  if (Array.isArray(value)) return value.length ? value.join("、") : "暂无记录";
  if (typeof value === "object") return value.status || value.result || value.summary || "已有记录";
  return String(value);
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
  const plan = snapshot?.raw_report?.plan;
  const state = run?.state || "planning";
  const briefing = snapshot?.daily_briefing || {};
  const missions = snapshot?.sprint?.missions || [];
  const sourceSprint = snapshot?.sprint || plan?.sprint || plan?.summary?.sprint;
  const recommendedMission = [...missions]
    .filter((item) => ["planned", "waiting_execution_approval", "in_progress", "waiting_commit_approval"].includes(item.status))
    .sort((left, right) => (right.priority || 0) - (left.priority || 0))[0] || mission;
  const sprintCounts = {
    total: sourceSprint?.total_missions ?? sourceSprint?.mission_count ?? plan?.summary?.total_missions,
    completed: sourceSprint?.completed_missions ?? plan?.summary?.completed_missions,
    active: sourceSprint?.in_progress_missions ?? plan?.summary?.in_progress_missions,
    blocked: sourceSprint?.blocked_missions?.length ?? sourceSprint?.blocked_count ?? plan?.summary?.blocked_missions?.length,
  };
  const countParts = [sprintCounts.completed, sprintCounts.active, sprintCounts.blocked]
    .filter((value) => Number.isFinite(value));
  const derivedTotal = sprintCounts.total ?? (countParts.length ? countParts.reduce((sum, value) => sum + value, 0) : undefined);
  const progress = derivedTotal > 0 && Number.isFinite(sprintCounts.completed)
    ? (sprintCounts.completed / derivedTotal) * 100
    : (Number.isFinite(sourceSprint?.progress) ? sourceSprint.progress : undefined);
  const waitingDecision = snapshot?.actions?.approve_execution
    ? { title: `等待批准执行「${mission?.title || "当前 Mission"}」`, reason: "执行授权是当前 Run 启动前的必要条件。" }
    : snapshot?.actions?.approve_commit
      ? { title: `等待批准 Commit「${mission?.title || "当前开发成果"}」`, reason: "验收已完成，只有 Founder 授权后才能提交。" }
      : ["failed", "timed_out", "commit_rejected", "stale"].includes(state)
        ? { title: `需要决定 Retry 或 Rollback`, reason: run?.failure_summary || artifact?.rollback_plan || "当前 Run 无法继续自动推进。" }
        : null;
  const completedMissions = briefing.recent_completed_missions || [];
  const latestRun = briefing.latest_completed_run || briefing.recent_runs?.[0] || null;
  const latestCommit = briefing.recent_git_commits?.[0] || commit;
  const resultTitle = completedMissions.length
    ? completedMissions.map((item) => item.title).slice(0, 5).join(" · ")
    : "昨日暂无已完成 Mission";
  const resultFacts = [
    `最近 Run：${latestRun?.run_id ? `${latestRun.run_id}（${RUN_LABELS[latestRun.status] || latestRun.status}）` : "暂无记录"}`,
    `最近 Commit：${latestCommit?.commit_hash ? `${latestCommit.commit_hash.slice(0, 8)} · ${latestCommit.commit_message || "无说明"}` : "暂无提交"}`,
    `Tests：${displayEvidence(briefing.latest_tests || artifact?.tests)}`,
    `Build：${displayEvidence(briefing.latest_build || artifact?.build)}`,
  ].join(" · ");
  const nextAction = waitingDecision
    ? waitingDecision.title
    : run && !snapshot?.actions?.terminal
      ? `跟进「${mission?.title || "当前 Mission"}」的执行状态`
        : recommendedMission
        ? `推进「${recommendedMission.title}」`
        : "向 Developer OS 获取今日推荐 Mission";
  const lastSyncedAt = snapshot?.workspace?.last_checked_at;
  const items = [
    { label: "昨日开发成果", title: resultTitle, detail: resultFacts },
    {
      label: "今日建议",
      title: recommendedMission?.title || (loading ? "正在读取 Developer OS…" : "暂无推荐 Mission"),
      detail: mission?.business_reason || (error?.suggestion || "Developer OS 尚未生成今日建议。"),
    },
    {
      label: "等待决策",
      title: briefing.decisions?.length ? briefing.decisions.map((item) => item.title).slice(0, 3).join(" · ") : (waitingDecision?.title || "当前无需 Founder 拍板"),
      detail: briefing.decisions?.length ? briefing.decisions.map((item) => item.type === "execution" ? "等待执行授权" : item.type === "commit" ? "等待提交授权" : "需要 Retry 或 Rollback").join(" · ") : (waitingDecision ? `${waitingDecision.reason} 当前状态：${RUN_LABELS[state] || state}` : "Developer OS 当前没有返回批准、Retry 或 Rollback 待办。"),
    },
    {
      label: "Sprint 进度",
      title: sourceSprint?.title || sourceSprint?.name || "暂无 Sprint 记录",
      detail: `总 Mission ${displayEvidence(derivedTotal)} · 已完成 ${displayEvidence(sprintCounts.completed)} · 进行中 ${displayEvidence(sprintCounts.active)} · Blocked ${displayEvidence(sprintCounts.blocked)} · 完成百分比 ${Number.isFinite(progress) ? `${Math.round(progress)}%` : "暂无记录"}`,
      progress,
    },
    {
      label: "下一最佳动作",
      title: nextAction,
      detail: waitingDecision ? waitingDecision.reason : `依据 Mission 优先级、当前 Sprint 与 Developer Run 状态（${RUN_LABELS[state] || state}）生成。`,
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
