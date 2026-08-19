const PHASE_LABELS = {
  issue: "理解问题", inspect: "定位", plan: "规划", execution: "实施", fix: "修复",
  verification: "验证", verify: "验证", lightweight_verification: "验证当前环境",
  reuse_lookup: "复用查找", candidate_found: "复用匹配", binding_validation: "绑定验证",
  learning: "沉淀经验", closure: "收口", complete: "完成",
};

const EVENT_LABELS = {
  queued: "任务已进入受控执行队列",
  worker_started: "执行器已接管任务",
  codex_started: "已开始实施代码修改",
  codex_finished: "已完成代码修改",
  testing_started: "已进入自动验证",
  testing_finished: "已完成自动测试",
  artifact_saved: "已保存成果证据",
  memory_saved: "已沉淀本轮经验",
  completed: "任务已完成",
  stall_detected: "已检测到执行停滞",
  technical_resolution_started: "已开始自动诊断与恢复",
  technical_resolution_attempted: "已完成一次安全恢复尝试",
  technical_resolution_completed: "自动恢复已完成",
  technical_resolution_exhausted: "安全恢复尝试已耗尽",
  founder_stop_requested: "Founder 已请求停止任务",
  cancelled_by_founder: "任务已安全停止",
};

const ISSUE_LABELS = {
  STALLED_EXECUTION: "执行流程长时间没有产生有效进展",
  LOCAL_OS_PERMISSION_DENIED: "本地检查受到系统权限限制",
  standard_task_verification_failed: "自动验证尚未满足全部验收条件",
};

const REPAIR_LABELS = {
  avoid_privileged_cross_app_inspection: "避开需要额外系统权限的检查方式",
  use_application_owned_health_evidence: "改用 Sino 自己的运行状态与健康证据",
  reconcile_execution_state: "重新对账执行状态并恢复验证流程",
};

function readable(value, fallback = "—") {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) return value.filter(Boolean).join("；") || fallback;
  if (value && typeof value === "object") return value.summary || value.reason || value.message || value.type || fallback;
  return fallback;
}

function readableIssue(value, fallback) {
  if (typeof value === "string") return ISSUE_LABELS[value] || value;
  return readable(value, fallback);
}

function readableRepair(value, fallback) {
  if (!Array.isArray(value)) return readable(value, fallback);
  const steps = value.map((item) => REPAIR_LABELS[item] || item).filter(Boolean);
  return steps.length ? steps.join(" → ") : fallback;
}

function relativeProgress(value) {
  if (!value) return "尚无有效进展时间";
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  if (!Number.isFinite(elapsed)) return "时间未知";
  const minutes = Math.floor(elapsed / 60000);
  return minutes < 1 ? "不到 1 分钟前" : `${minutes} 分钟前`;
}

function recentEventSummaries(events) {
  return [...(events || [])]
    .filter((event) => event?.event_name && event.event_name !== "worker_heartbeat")
    .slice(-3)
    .reverse()
    .map((event) => EVENT_LABELS[event.event_name] || readable(event.message, event.event_name));
}

function executionDetail(brain, snapshot) {
  const route = brain?.discovery?.task_complexity_route || {};
  const progress = brain?.execution_progress || {};
  const contract = route.standard_task_contract || route.quick_fix_contract || {};
  const resolution = route.technical_resolution_contract || {};
  const gate = route.founder_gate_contract || brain?.discovery?.autonomous_main_loop?.founder_gate_contract;
  const result = route.visible_result || {};
  const execution = snapshot?.active_execution || {};
  const status = progress.execution_status || route.execution_status;
  const phase = progress.current_phase || route.current_step;
  const task = contract.source_goal || brain?.goal_brief?.goal || snapshot?.conversation?.title || contract.objective || contract.expected_change || "当前任务";
  const target = result.title || contract.target_surface || contract.target_area || task;
  const recent = recentEventSummaries(execution.events);
  const attemptCount = resolution.attempt_count ?? resolution.attempts?.length ?? 0;
  const retryLimit = resolution.retry_limit ?? resolution.retry_budget;

  if (status === "cancelled") return {
    state: "cancelled", task, phase: "已停止", processing: "本次任务已由 Founder 停止。",
    problem: "Founder Emergency Stop", next: "Execution Evidence 已保留，可返回讨论查看历史。", recent,
  };
  if (status === "completed" || phase === "complete") return {
    state: "completed", task, phase: "完成", processing: readable(result.title, "任务已完成"),
    problem: null, next: progress.next_action || "等待 Founder 验收", recent,
    result: { title: result.title || task, verification: result.verification_status || progress.verification_status || "PASS" },
  };
  if (gate || status === "waiting_for_founder_authorization") return {
    state: "gate", task, phase: "等待 Founder 授权",
    processing: "安全范围内的工作已经完成，下一步将跨越明确授权边界。",
    problem: readable(gate?.reason || progress.technical_blocker, "需要 Founder 确认授权范围"),
    next: readable(gate?.resume_action || progress.next_action, "批准后继续原任务"), recent,
  };
  if (progress.stalled || status === "stalled") return {
    state: "stalled", task, phase: "诊断执行停滞",
    processing: "Sino 正在检查执行器、回调与运行状态，并尝试安全恢复。",
    problem: `最后有效进展：${relativeProgress(progress.meaningful_progress_at)}`,
    next: "完成诊断后尝试安全恢复", recent,
  };
  if (["self_healing", "retrying"].includes(status) || ["pending", "diagnosing", "retrying"].includes(resolution.resolution_status)) return {
    state: "self_healing", task, phase: "自动恢复",
    processing: readableRepair(resolution.repair_plan, "Sino 正在重新对账执行状态并恢复原流程。"),
    problem: readableIssue(resolution.issue_type || resolution.evidence || progress.technical_blocker, "检测到执行流程未正常闭环"),
    next: progress.next_action || "恢复成功后继续原阶段", recent,
    attempt: retryLimit ? `${attemptCount}/${retryLimit}` : String(attemptCount),
  };
  if (["verification", "verify", "lightweight_verification"].includes(phase) || status === "testing") return {
    state: "verification", task, phase: "验证",
    processing: `正在验证${target}是否满足当前任务的验收条件。`,
    problem: progress.technical_blocker ? readable(progress.technical_blocker) : null,
    next: progress.next_action || "完成验证并输出验收结果", recent,
  };
  return {
    state: "executing", task, phase: PHASE_LABELS[phase] || "实施",
    processing: progress.current_action || `正在按已确认范围处理${target}。`,
    problem: progress.technical_blocker ? readable(progress.technical_blocker) : null,
    next: progress.next_action || "继续当前任务的下一项工作", recent,
  };
}

export function LiveExecutionDetail({ brain, snapshot, onViewResult }) {
  const route = brain?.discovery?.task_complexity_route;
  if (!route || route.classification === "STRATEGIC_TASK" || !["STANDARD_TASK", "QUICK_FIX"].includes(route.classification)) return null;
  const detail = executionDetail(brain, snapshot);
  const progress = brain.execution_progress || {};
  const execution = snapshot?.active_execution || {};
  return <section className="sino-live-execution-detail" aria-label="实时执行详情" data-execution-state={detail.state}>
    <header><span>Live Execution Detail</span><h2>{detail.state === "completed" ? "任务完成" : detail.state === "cancelled" ? "任务已停止" : "实时执行详情"}</h2></header>
    <dl>
      <div><dt>当前任务</dt><dd>{detail.task}</dd></div>
      <div><dt>当前阶段</dt><dd>{detail.phase}</dd></div>
      <div><dt>正在处理</dt><dd>{detail.processing}</dd></div>
      {detail.recent.length ? <div><dt>最近完成</dt><dd><ul>{detail.recent.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></dd></div> : null}
      {detail.problem ? <div><dt>当前问题</dt><dd>{detail.problem}</dd></div> : null}
      {detail.attempt ? <div><dt>已尝试</dt><dd>{detail.attempt}</dd></div> : null}
      <div><dt>下一步</dt><dd>{detail.next}</dd></div>
    </dl>
    {detail.result ? <section className="sino-live-execution-detail__result" aria-label="验收结果"><strong>{detail.result.title}</strong><span>验证：{detail.result.verification}</span>{onViewResult ? <button type="button" onClick={onViewResult}>查看结果</button> : null}</section> : null}
    <details><summary>查看技术详情</summary><dl>
      <div><dt>Task ID</dt><dd>{progress.task_id || "—"}</dd></div><div><dt>Execution ID</dt><dd>{progress.execution_id || "—"}</dd></div>
      <div><dt>Updated</dt><dd>{progress.updated_at || "—"}</dd></div><div><dt>Tests</dt><dd>{execution.result?.tests?.length || 0}</dd></div>
      <div><dt>Changed Files</dt><dd>{execution.result?.changed_files?.length || 0}</dd></div><div><dt>Checkpoint</dt><dd>{execution.commit_hash || "—"}</dd></div>
    </dl></details>
  </section>;
}
