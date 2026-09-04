import { useState } from "react";
import { getStudioState, CONTENT_TYPE_LABEL } from "../mock/studioMock.js";
import {
  DIRECTOR_STAGES, getDirectorProjectState, getStageTargetPage, setActiveStage, lockStageAndContinue,
  regenerateStage, updateShot, addShot, removeShot, reorderShot, regenerateShot, lockShot,
} from "../mock/directorMock.js";
import { ProjectCreationModal } from "./ProjectCreationModal.jsx";
import { Card, DemoBadge, Field, Pill } from "./uiHelpers.jsx";
import { useInlineFeedback } from "./useInlineFeedback.js";
import { formatMoney } from "./formatters.js";

const STAGE_STATUS_LABEL = { pending: "等待", in_progress: "进行中", completed: "完成", locked: "已锁定" };
const STAGE_STATUS_TONE = { pending: "neutral", in_progress: "info", completed: "success", locked: "success" };
const EMPTY_PROJECT_STATE = { stages: [], shots: [], assets: [] };

/**
 * AI导演工作台（阶段：Studio V3 Integration §十，本轮最核心页面）。
 * 三栏结构：左侧项目资产区、中间生产流程 + 当前编辑画布、右侧当前
 * 对象检查器——不是流程状态图，十个阶段全部可点击，分镜阶段支持
 * 真实的镜头增删改查/重新生成/锁定/排序。通过 contentProjects 行、
 * Studio秘书快捷操作、热点"创建项目"进入，projectId 缺省回退到
 * 旗舰演示项目 proj-7《重生后我接管了老板的公司》。
 *
 * 所有 Hooks 无条件在组件顶层调用（包括"正在新建项目、还没有
 * projectId"这个分支）——用空数组兜底数据，而不是在 Hooks 之前提前
 * return，避免不同渲染路径下 Hooks 调用数量不一致。
 */
export function DirectorWorkspace({ navigate, params = {} }) {
  const [createOpen, setCreateOpen] = useState(!!params.openCreate);
  const [projectId, setProjectId] = useState(params.projectId || (params.openCreate ? null : "proj-7"));
  const [feedback, showFeedback] = useInlineFeedback();
  const [assetTab, setAssetTab] = useState("全部");
  const [, setRefreshTick] = useState(0);
  const [noteDraft, setNoteDraft] = useState({});

  const { contentProjects } = getStudioState();
  const project = projectId ? contentProjects.find((p) => p.projectId === projectId) : null;
  const { stages, shots, assets } = projectId ? getDirectorProjectState(projectId) : EMPTY_PROJECT_STATE;

  const [selectedStageKey, setSelectedStageKey] = useState(
    () => stages.find((s) => s.status === "in_progress")?.stageKey ?? stages[0]?.stageKey ?? null
  );
  const [selectedShotId, setSelectedShotId] = useState(() => shots[0]?.shotId ?? null);

  function forceRefresh() { setRefreshTick((t) => t + 1); }

  const activeStage = stages.find((s) => s.stageKey === selectedStageKey) ?? stages[0] ?? null;
  const selectedShot = shots.find((s) => s.shotId === selectedShotId) ?? shots[0] ?? null;
  const isStoryboardStage = activeStage?.stageKey === "storyboard";
  const filteredAssets = assetTab === "全部" ? assets : assets.filter((a) => a.tab === assetTab);

  async function handleStageClick(stageKey) {
    setSelectedStageKey(stageKey);
    if (stages.find((s) => s.stageKey === stageKey)?.status === "pending") {
      await setActiveStage(projectId, stageKey);
      forceRefresh();
    }
  }

  async function handleRegenerateStage() {
    await regenerateStage(projectId, activeStage.stageKey);
    showFeedback("已提交重新生成请求（演示，未产生真实模型调用）");
    forceRefresh();
  }

  async function handleLockAndContinue() {
    await lockStageAndContinue(projectId, activeStage.stageKey);
    showFeedback("已锁定该阶段并推进到下一阶段");
    forceRefresh();
  }

  function handleEditStage() {
    const targetPage = getStageTargetPage(activeStage.stageKey);
    if (targetPage) navigate(targetPage, { projectId });
    else showFeedback("该阶段暂无独立编辑工作台，可直接在此重新生成");
  }

  async function handleShotUpdate(patch) {
    await updateShot(projectId, selectedShot.shotId, patch);
    forceRefresh();
  }

  async function handleAddShot() {
    await addShot(projectId, selectedShot?.order ?? shots.length);
    showFeedback("已新增镜头（Storyboard Agent 补充）");
    forceRefresh();
  }

  async function handleRemoveShot(shotId) {
    await removeShot(projectId, shotId);
    forceRefresh();
  }

  async function handleReorderShot(direction) {
    await reorderShot(projectId, selectedShot.shotId, direction);
    forceRefresh();
  }

  async function handleRegenerateShot() {
    await regenerateShot(projectId, selectedShot.shotId);
    showFeedback("镜头已重新生成");
    forceRefresh();
  }

  async function handleLockShot() {
    await lockShot(projectId, selectedShot.shotId);
    showFeedback("镜头已锁定");
    forceRefresh();
  }

  if (createOpen || !projectId) {
    return (
      <ProjectCreationModal
        open
        onClose={() => { setCreateOpen(false); if (!projectId) navigate("contentProjects"); }}
        presetType={params.presetType}
        presetTrendId={params.presetTrendId}
        presetIpId={params.presetIpId}
        onCreated={({ project: created, isGraphic }) => {
          setCreateOpen(false);
          if (isGraphic) {
            navigate("graphicContentEditor", { projectId: created.projectId });
          } else {
            setProjectId(created.projectId);
            navigate("director", { projectId: created.projectId });
          }
        }}
      />
    );
  }

  if (!project) {
    return (
      <Card title="AI导演工作台">
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>未找到该内容项目，可能已被归档或删除。</p>
        <button type="button" className="st-btn" onClick={() => navigate("contentProjects")}>返回内容项目列表</button>
      </Card>
    );
  }

  return (
    <div>
      <div className="st-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <b style={{ fontSize: 15 }}>AI导演工作台 · {project.name}</b>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
            {CONTENT_TYPE_LABEL[project.contentType] ?? project.contentType} · 热点 → 创意 → 剧本 → 脚本 → 分镜 → 角色 → 生成 → AI剪辑 → 审核 → 发布
          </p>
        </div>
        {feedback ? <span className="st-inline-feedback">{feedback}</span> : <DemoBadge />}
      </div>

      <div className="st-workspace">
        {/* 左侧：项目资产区 */}
        <aside className="st-workspace-col">
          <div className="st-workspace-col-head">
            <h3>项目素材库</h3>
            <p>{project.name}</p>
          </div>
          <div style={{ display: "flex", gap: 4, padding: "8px 10px 0" }}>
            {["全部", "角色", "场景"].map((t) => (
              <button key={t} type="button" className={`st-tab st-tab-sm${assetTab === t ? " active" : ""}`} style={{ padding: "4px 8px", fontSize: 10 }} onClick={() => setAssetTab(t)}>{t}</button>
            ))}
          </div>
          <div className="st-workspace-col-body">
            {filteredAssets.map((a, idx) => (
              <div key={idx} className="st-asset-item">{a.icon} {a.label}{a.detail ? <small>{a.detail}</small> : null}</div>
            ))}
          </div>
        </aside>

        {/* 中间：生产流程 + 当前编辑画布 */}
        <main className="st-workspace-col">
          <div className="st-workspace-col-head">
            <h3>十阶段生产流程</h3>
            <p>点击任意阶段进入编辑，绿色为已完成/已锁定</p>
          </div>
          <div className="st-workspace-col-body" style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 14 }}>
            <div className="st-stage-list">
              {DIRECTOR_STAGES.map((s) => {
                const stageData = stages.find((st) => st.stageKey === s.stageKey);
                return (
                  <div
                    key={s.stageKey}
                    className={`st-stage${activeStage?.stageKey === s.stageKey ? " active" : ""}`}
                    onClick={() => handleStageClick(s.stageKey)}
                  >
                    <div className="st-stage-num">{String(s.order).padStart(2, "0")}</div>
                    <div>
                      <b>{s.name}</b>
                      <p>{stageData?.agentName}</p>
                    </div>
                    <Pill tone={STAGE_STATUS_TONE[stageData?.status]}>{STAGE_STATUS_LABEL[stageData?.status]}</Pill>
                  </div>
                );
              })}
            </div>

            {activeStage ? (
              <div>
                <div className="editor-toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h3 style={{ fontSize: 15, margin: 0 }}>{activeStage.name} · 编辑画布</h3>
                  <div className="st-btn-row">
                    <button type="button" className="st-btn st-btn-sm" onClick={handleEditStage}>编辑结果 / 进入工作台</button>
                    <button type="button" className="st-btn st-btn-sm" onClick={handleRegenerateStage}>重新生成</button>
                    <button type="button" className="st-btn st-btn-sm" onClick={() => showFeedback("已生成 B 版，可在右侧对比")}>生成B版</button>
                    <button type="button" className="st-btn st-btn--primary st-btn-sm" onClick={handleLockAndContinue}>锁定并继续</button>
                  </div>
                </div>

                {isStoryboardStage ? (
                  <div className="st-shot-grid">
                    {shots.map((shot) => (
                      <div
                        key={shot.shotId}
                        className={`st-shot-card${selectedShot?.shotId === shot.shotId ? " selected" : ""}${shot.status === "locked" ? " locked" : ""}`}
                        onClick={() => setSelectedShotId(shot.shotId)}
                      >
                        <div className="st-shot-thumb">镜头预览 {String(shot.order).padStart(2, "0")}</div>
                        <div className="st-shot-body">
                          <b>{shot.shotType} · {shot.durationSeconds}秒</b>
                          <p>{shot.description}</p>
                        </div>
                      </div>
                    ))}
                    <button type="button" className="st-shot-add" onClick={handleAddShot}>＋ 新增镜头<br /><span style={{ fontSize: 10 }}>让分镜 Agent 补充</span></button>
                  </div>
                ) : (
                  <div className="st-card" style={{ margin: 0 }}>
                    <div className="st-field-row">
                      <div><span style={{ fontSize: 11, color: "var(--text-secondary)" }}>负责 Agent</span><p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 700 }}>{activeStage.agentName}</p></div>
                      <div><span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Prompt 版本</span><p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 700 }}>{activeStage.promptVersion}</p></div>
                      <div><span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Skill</span><p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 700 }}>{activeStage.skillUsed}</p></div>
                      <div><span style={{ fontSize: 11, color: "var(--text-secondary)" }}>模型</span><p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 700 }}>{activeStage.modelUsed}</p></div>
                    </div>
                    <div className="st-field-row" style={{ marginTop: 10 }}>
                      <div><span style={{ fontSize: 11, color: "var(--text-secondary)" }}>本次 Token 成本</span><p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 700 }}>{activeStage.tokenCost.toLocaleString()}</p></div>
                      <div><span style={{ fontSize: 11, color: "var(--text-secondary)" }}>算力成本</span><p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 700 }}>{activeStage.computeCost}</p></div>
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>运行日志</span>
                      {activeStage.runLog.length === 0 ? (
                        <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>暂无运行记录</p>
                      ) : (
                        <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12 }}>
                          {activeStage.runLog.map((log, i) => <li key={i}>{log}</li>)}
                        </ul>
                      )}
                    </div>
                    <Field label="添加人工修改意见">
                      <textarea
                        value={noteDraft[activeStage.stageKey] ?? ""}
                        onChange={(e) => setNoteDraft((d) => ({ ...d, [activeStage.stageKey]: e.target.value }))}
                        placeholder="例如：强化第二段的情绪钩子"
                      />
                    </Field>
                    <button
                      type="button"
                      className="st-btn st-btn-sm"
                      onClick={() => showFeedback("已记录人工修改意见，将在下次重新生成时参考")}
                    >
                      保存修改意见
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </main>

        {/* 右侧：当前对象检查器 */}
        <aside className="st-workspace-col">
          <div className="st-workspace-col-head">
            <h3>{isStoryboardStage ? "当前镜头检查器" : "阶段检查器"}</h3>
            <p>人工可随时调整 Agent 输出</p>
          </div>
          <div className="st-workspace-col-body">
            {isStoryboardStage && selectedShot ? (
              <>
                <Field label="镜头类型"><input value={selectedShot.shotType} onChange={(e) => handleShotUpdate({ shotType: e.target.value })} /></Field>
                <Field label="景别">
                  <select value={selectedShot.shotSize} onChange={(e) => handleShotUpdate({ shotSize: e.target.value })}>
                    {["全景", "远景", "中景", "近景", "特写", "双人中景", "双人对峙"].map((s) => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="画面描述"><textarea value={selectedShot.description} onChange={(e) => handleShotUpdate({ description: e.target.value })} /></Field>
                <Field label="人物动作"><input value={selectedShot.action} onChange={(e) => handleShotUpdate({ action: e.target.value })} /></Field>
                <Field label="表情"><input value={selectedShot.expression} onChange={(e) => handleShotUpdate({ expression: e.target.value })} /></Field>
                <Field label="对白"><textarea value={selectedShot.dialogue} onChange={(e) => handleShotUpdate({ dialogue: e.target.value })} /></Field>
                <Field label="镜头运动">
                  <select value={selectedShot.cameraMovement} onChange={(e) => handleShotUpdate({ cameraMovement: e.target.value })}>
                    {["固定", "推镜", "拉镜", "环绕", "跟拍"].map((s) => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="镜头时长（秒）"><input type="number" step="0.5" value={selectedShot.durationSeconds} onChange={(e) => handleShotUpdate({ durationSeconds: Number(e.target.value) })} /></Field>
                <Field label="场景"><input value={selectedShot.scene} onChange={(e) => handleShotUpdate({ scene: e.target.value })} /></Field>
                <Field label="生成模型">
                  <select value={selectedShot.generationModel} onChange={(e) => handleShotUpdate({ generationModel: e.target.value })}>
                    <option>Video Model A · 电影感</option>
                    <option>Video Model B · 写实</option>
                  </select>
                </Field>
                {selectedShot.agentSuggestion ? (
                  <div className="st-card" style={{ margin: "0 0 10px", padding: 11 }}>
                    <h4 style={{ fontSize: 11, margin: "0 0 8px" }}>Agent 建议</h4>
                    <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>{selectedShot.agentSuggestion}</p>
                    <div className="st-btn-row">
                      <button type="button" className="st-btn st-btn-sm" onClick={() => handleShotUpdate({ agentSuggestion: "" })}>接受建议</button>
                      <button type="button" className="st-btn st-btn-sm" onClick={() => handleShotUpdate({ agentSuggestion: "" })}>驳回</button>
                    </div>
                  </div>
                ) : null}
                <div className="st-card" style={{ margin: "0 0 10px", padding: 11 }}>
                  <h4 style={{ fontSize: 11, margin: "0 0 8px" }}>成本与质量</h4>
                  <p style={{ fontSize: 11 }}>预计生成成本 {formatMoney(selectedShot.cost)}<br />一致性评分 {selectedShot.consistencyScore}<br />平台风险：{selectedShot.platformRisk}</p>
                </div>
                <div className="st-btn-row">
                  <button type="button" className="st-btn st-btn-sm" onClick={handleRegenerateShot}>重新生成该镜头</button>
                  <button type="button" className="st-btn st-btn-sm" onClick={() => handleReorderShot("up")}>上移</button>
                  <button type="button" className="st-btn st-btn-sm" onClick={() => handleReorderShot("down")}>下移</button>
                  <button type="button" className="st-btn st-btn-sm" onClick={handleLockShot}>锁定该镜头</button>
                  <button type="button" className="st-btn st-btn-sm" onClick={() => handleRemoveShot(selectedShot.shotId)}>删除镜头</button>
                </div>
              </>
            ) : activeStage ? (
              <>
                <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>当前阶段「{activeStage.name}」由 {activeStage.agentName} 负责，详细编辑请进入对应工作台。</p>
                <div className="st-card" style={{ margin: "10px 0 0", padding: 11 }}>
                  <h4 style={{ fontSize: 11, margin: "0 0 8px" }}>成本</h4>
                  <p style={{ fontSize: 11 }}>Token 成本 {activeStage.tokenCost.toLocaleString()} · 算力成本 {activeStage.computeCost}</p>
                </div>
              </>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
