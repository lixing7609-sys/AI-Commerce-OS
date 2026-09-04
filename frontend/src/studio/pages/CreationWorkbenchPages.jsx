import { useState } from "react";
import { getDirectorProjectState, regenerateShot, removeShot, addShot } from "../mock/directorMock.js";
import { getStudioState } from "../mock/studioMock.js";
import { Card, DemoBadge, Field, Pill, Table, Tabs } from "./uiHelpers.jsx";
import { useInlineFeedback } from "./useInlineFeedback.js";

const DEFAULT_PROJECT_ID = "proj-7";

/* ============================ 剧本 / 脚本 / 分镜 ============================ */

const SCRIPT_SEED = {
  genre: "都市职场逆袭 · 情绪爽剧", coreConflict: "被夺权的创业者以新身份重新夺回自己一手创办的公司",
  characterRelations: "林晚（女主）曾是公司创始人，被合伙人周启架空后重新入职；两人从对手走向对峙。",
  worldSetting: "当代一线城市，家居科技创业公司「星辰家居」总部", synopsis: "林晚被扫地出门三年后，以匿名股东身份重返公司，逐步夺回控制权。",
  episodeStructure: "24集，每集60-90秒，单集一个反转钩子", characterArc: "从隐忍到强势，从个人复仇到团队重建",
  emotionCurve: "开篇压抑→中段逐步翻盘→结尾扬眉吐气", hookPerEpisode: "每集结尾留一个身份/证据类悬念",
  endingSuspense: "最后一集揭晓幕后势力，为第二季埋线", platformFit: "红果 · 强反转 + 强代入", monetizationGoal: "平台分成为主，抖音预热引流",
};

const SCENE_ROWS_SEED = [
  { id: 1, scene: "第1场", time: "日", location: "公司大堂", characters: "林晚", action: "低调走入，被前台拦下", dialogue: "我是新来的股东顾问。", narration: "", sfx: "环境音", pace: "慢", duration: "8秒", transition: "硬切", hook: "无人认出她", cta: "" },
  { id: 2, scene: "第2场", time: "日", location: "董事会会议室", characters: "林晚,周启", action: "林晚推门而入，全场安静", dialogue: "从今天起，这家公司由我说了算。", narration: "", sfx: "紧张音效", pace: "快", duration: "12秒", transition: "切", hook: "周启表情崩溃", cta: "关注看后续" },
];

export function ScriptStoryboardPage({ navigate, params = {} }) {
  const projectId = params.projectId || DEFAULT_PROJECT_ID;
  const [tab, setTab] = useState("script");
  const [script, setScript] = useState(SCRIPT_SEED);
  const [sceneRows, setSceneRows] = useState(SCENE_ROWS_SEED);
  const [feedback, showFeedback] = useInlineFeedback();
  const { shots } = getDirectorProjectState(projectId);

  function setScriptField(key, value) { setScript((s) => ({ ...s, [key]: value })); }
  function setSceneField(id, key, value) { setSceneRows((rows) => rows.map((r) => (r.id === id ? { ...r, [key]: value } : r))); }
  function addSceneRow() { setSceneRows((rows) => [...rows, { id: Date.now(), scene: `第${rows.length + 1}场`, time: "日", location: "", characters: "", action: "", dialogue: "", narration: "", sfx: "", pace: "中", duration: "", transition: "切", hook: "", cta: "" }]); }
  function removeSceneRow(id) { setSceneRows((rows) => rows.filter((r) => r.id !== id)); }

  async function handleRegenerateShot(shotId) { await regenerateShot(projectId, shotId); showFeedback("镜头已重新生成"); }
  async function handleRemoveShot(shotId) { await removeShot(projectId, shotId); showFeedback("镜头已删除"); }
  async function handleAddShot() { await addShot(projectId, shots.length); showFeedback("已新增镜头"); }

  return (
    <div>
      <Card title="剧本 / 脚本 / 分镜" action={feedback ? <span className="st-inline-feedback">{feedback}</span> : <DemoBadge />}>
        <Tabs tabs={[{ key: "script", label: "剧本工作台" }, { key: "episode", label: "脚本工作台" }, { key: "storyboard", label: "分镜工作台" }]} active={tab} onChange={setTab} />

        {tab === "script" ? (
          <div className="st-field-row">
            {Object.entries({
              genre: "项目题材", coreConflict: "核心冲突", characterRelations: "人物关系", worldSetting: "世界观",
              synopsis: "故事梗概", episodeStructure: "集数结构", characterArc: "人物弧光", emotionCurve: "情绪曲线",
              hookPerEpisode: "每集钩子", endingSuspense: "结尾悬念", platformFit: "平台适配", monetizationGoal: "变现目标",
            }).map(([key, label]) => (
              <Field key={key} label={label}>
                {["synopsis", "characterRelations"].includes(key)
                  ? <textarea value={script[key]} onChange={(e) => setScriptField(key, e.target.value)} />
                  : <input value={script[key]} onChange={(e) => setScriptField(key, e.target.value)} />}
              </Field>
            ))}
          </div>
        ) : null}

        {tab === "episode" ? (
          <>
            <Table
              columns={[
                { key: "scene", label: "场次" }, { key: "time", label: "时间" }, { key: "location", label: "地点" },
                { key: "characters", label: "人物" },
                { key: "action", label: "动作", render: (r) => <input value={r.action} onChange={(e) => setSceneField(r.id, "action", e.target.value)} onClick={(e) => e.stopPropagation()} style={{ width: 140 }} /> },
                { key: "dialogue", label: "台词", render: (r) => <input value={r.dialogue} onChange={(e) => setSceneField(r.id, "dialogue", e.target.value)} onClick={(e) => e.stopPropagation()} style={{ width: 160 }} /> },
                { key: "narration", label: "旁白" }, { key: "sfx", label: "音效" }, { key: "pace", label: "节奏" },
                { key: "duration", label: "时长" }, { key: "transition", label: "转场" }, { key: "hook", label: "钩子" }, { key: "cta", label: "CTA" },
                { key: "actions", label: "操作", render: (r) => <button type="button" className="st-btn st-btn-sm" onClick={() => removeSceneRow(r.id)}>删除</button> },
              ]}
              rows={sceneRows}
            />
            <button type="button" className="st-btn" style={{ marginTop: 10 }} onClick={addSceneRow}>＋ 新增场次</button>
          </>
        ) : null}

        {tab === "storyboard" ? (
          <>
            <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>共 {shots.length} 个镜头 · 需要卡片式画布编辑请进入 <a onClick={() => navigate("director", { projectId })} style={{ color: "var(--st-accent, #0D9488)", cursor: "pointer" }}>AI导演工作台</a></p>
            <Table
              columns={[
                { key: "order", label: "序号" }, { key: "shotType", label: "镜头类型" }, { key: "description", label: "画面描述" },
                { key: "durationSeconds", label: "时长(秒)" }, { key: "status", label: "状态", render: (r) => <Pill tone={r.status === "locked" ? "success" : r.status === "generated" ? "info" : "neutral"}>{r.status === "locked" ? "已锁定" : r.status === "generated" ? "已生成" : "草稿"}</Pill> },
                { key: "actions", label: "操作", render: (r) => (
                  <span className="st-btn-row">
                    <button type="button" className="st-btn st-btn-sm" onClick={(e) => { e.stopPropagation(); handleRegenerateShot(r.shotId); }}>重新生成</button>
                    <button type="button" className="st-btn st-btn-sm" onClick={(e) => { e.stopPropagation(); handleRemoveShot(r.shotId); }}>删除</button>
                  </span>
                ) },
              ]}
              rows={shots}
            />
            <button type="button" className="st-btn" style={{ marginTop: 10 }} onClick={handleAddShot}>＋ 新增镜头</button>
          </>
        ) : null}
      </Card>
    </div>
  );
}

/* ============================ 角色与场景 ============================ */

const CHARACTER_SEED = [
  { characterId: "c-1", name: "林晚", age: 28, appearance: "干练短发，商务风", costume: "藏青色西装套裙", personality: "冷静克制，外柔内刚", background: "公司原创始人，被夺权后隐忍三年", expressionSet: "冷静/隐忍/爆发", actionSet: "推门/对峙/签字", voiceProfile: "清亮少女音（成熟版）", referenceImage: "ref-linwan-01.png", consistencyId: "char-linwan", crossShotConsistent: true, crossEpisodeConsistent: true, version: 3 },
  { characterId: "c-2", name: "周启", age: 35, appearance: "干练偏强势商务风", costume: "深灰色西装", personality: "强势多疑", background: "现任公司老板，曾是林晚的合伙人", expressionSet: "强势/慌乱/威胁", actionSet: "拍桌/踱步", voiceProfile: "低沉中年音", referenceImage: "ref-zhouqi-01.png", consistencyId: "char-zhouqi", crossShotConsistent: true, crossEpisodeConsistent: true, version: 2 },
  { characterId: "c-3", name: "陆总", age: 48, appearance: "老练沉稳", costume: "中式立领外套", personality: "城府深，话不多", background: "幕后势力代表", expressionSet: "深沉/审视", actionSet: "端茶/凝视", voiceProfile: "低沉沙哑", referenceImage: "ref-luzong-01.png", consistencyId: "char-luzong", crossShotConsistent: true, crossEpisodeConsistent: false, version: 1 },
];

const SCENE_SEED = [
  { sceneId: "s-1", name: "公司会议室", layout: "环形会议桌，落地窗背景", time: "日", weather: "晴", colorTone: "冷色调", props: "股权协议、笔记本电脑", referenceImage: "ref-scene-meeting.png", consistencyId: "scene-meeting" },
  { sceneId: "s-2", name: "深夜办公室", layout: "开放式工位 + 独立办公室", time: "夜", weather: "—", colorTone: "暖黄灯光", props: "台灯、文件堆", referenceImage: "ref-scene-night-office.png", consistencyId: "scene-night-office" },
];

export function CharacterScenePage() {
  const [tab, setTab] = useState("character");
  const [characters, setCharacters] = useState(CHARACTER_SEED);
  const [scenes, setScenes] = useState(SCENE_SEED);
  const [feedback, showFeedback] = useInlineFeedback();

  function updateCharacter(id, key, value) { setCharacters((cs) => cs.map((c) => (c.characterId === id ? { ...c, [key]: value } : c))); }
  function updateScene(id, key, value) { setScenes((ss) => ss.map((s) => (s.sceneId === id ? { ...s, [key]: value } : s))); }
  function bumpVersion(id) { setCharacters((cs) => cs.map((c) => (c.characterId === id ? { ...c, version: c.version + 1 } : c))); showFeedback("已生成新版本角色形象"); }

  return (
    <Card title="角色与场景" action={feedback ? <span className="st-inline-feedback">{feedback}</span> : <DemoBadge />}>
      <Tabs tabs={[{ key: "character", label: "角色工作台" }, { key: "scene", label: "场景工作台" }]} active={tab} onChange={setTab} />
      {tab === "character" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {characters.map((c) => (
            <div key={c.characterId} className="st-card" style={{ margin: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <b style={{ fontSize: 13 }}>{c.name} · v{c.version}</b>
                <span className="st-btn-row">
                  <Pill tone={c.crossShotConsistent ? "success" : "warning"}>镜头一致性 {c.crossShotConsistent ? "通过" : "待处理"}</Pill>
                  <Pill tone={c.crossEpisodeConsistent ? "success" : "warning"}>跨集一致性 {c.crossEpisodeConsistent ? "通过" : "待处理"}</Pill>
                  <button type="button" className="st-btn st-btn-sm" onClick={() => bumpVersion(c.characterId)}>生成新版本</button>
                </span>
              </div>
              <div className="st-field-row">
                <Field label="年龄"><input type="number" value={c.age} onChange={(e) => updateCharacter(c.characterId, "age", Number(e.target.value))} /></Field>
                <Field label="外形"><input value={c.appearance} onChange={(e) => updateCharacter(c.characterId, "appearance", e.target.value)} /></Field>
                <Field label="服装"><input value={c.costume} onChange={(e) => updateCharacter(c.characterId, "costume", e.target.value)} /></Field>
                <Field label="性格"><input value={c.personality} onChange={(e) => updateCharacter(c.characterId, "personality", e.target.value)} /></Field>
                <Field label="背景"><input value={c.background} onChange={(e) => updateCharacter(c.characterId, "background", e.target.value)} /></Field>
                <Field label="表情集"><input value={c.expressionSet} onChange={(e) => updateCharacter(c.characterId, "expressionSet", e.target.value)} /></Field>
                <Field label="动作集"><input value={c.actionSet} onChange={(e) => updateCharacter(c.characterId, "actionSet", e.target.value)} /></Field>
                <Field label="声音"><input value={c.voiceProfile} onChange={(e) => updateCharacter(c.characterId, "voiceProfile", e.target.value)} /></Field>
                <Field label="一致性 ID"><input value={c.consistencyId} disabled /></Field>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {tab === "scene" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {scenes.map((s) => (
            <div key={s.sceneId} className="st-card" style={{ margin: 0 }}>
              <b style={{ fontSize: 13 }}>{s.name}</b>
              <div className="st-field-row" style={{ marginTop: 8 }}>
                <Field label="空间布局"><input value={s.layout} onChange={(e) => updateScene(s.sceneId, "layout", e.target.value)} /></Field>
                <Field label="时间"><input value={s.time} onChange={(e) => updateScene(s.sceneId, "time", e.target.value)} /></Field>
                <Field label="天气"><input value={s.weather} onChange={(e) => updateScene(s.sceneId, "weather", e.target.value)} /></Field>
                <Field label="色调"><input value={s.colorTone} onChange={(e) => updateScene(s.sceneId, "colorTone", e.target.value)} /></Field>
                <Field label="道具"><input value={s.props} onChange={(e) => updateScene(s.sceneId, "props", e.target.value)} /></Field>
                <Field label="一致性 ID"><input value={s.consistencyId} disabled /></Field>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

/* ============================ 图片 / 视频生成 ============================ */

export function MediaGenerationPage() {
  const { aiVideoTasks } = getStudioState();
  const [feedback, showFeedback] = useInlineFeedback();
  return (
    <Card title="图片 / 视频生成" action={feedback ? <span className="st-inline-feedback">{feedback}</span> : <DemoBadge />}>
      <Table
        columns={[
          { key: "name", label: "任务名称" }, { key: "stage", label: "当前阶段" }, { key: "generationModel", label: "生成模型" },
          { key: "tokenCost", label: "Token 成本", render: (r) => r.tokenCost.toLocaleString() }, { key: "computeCost", label: "算力成本" },
          { key: "publishPlatform", label: "发布平台" }, { key: "performance", label: "数据表现" },
          { key: "actions", label: "操作", render: () => (
            <span className="st-btn-row">
              <button type="button" className="st-btn st-btn-sm" onClick={(e) => { e.stopPropagation(); showFeedback("已提交重新生成"); }}>重新生成</button>
              <button type="button" className="st-btn st-btn-sm" onClick={(e) => { e.stopPropagation(); showFeedback("已生成 B 版供对比"); }}>生成B版</button>
            </span>
          ) },
        ]}
        rows={aiVideoTasks}
      />
    </Card>
  );
}

/* ============================ AI剪辑 ============================ */

const EDITING_OPERATIONS = [
  "自动粗剪", "自动精剪", "自动去停顿", "自动匹配BGM", "自动字幕", "自动配音", "声音克隆配置",
  "封面生成", "标题生成", "标签生成", "9:16转16:9", "1:1转16:9", "15秒版本", "30秒版本", "60秒版本", "A/B版本",
];

export function AiEditingPage() {
  const [done, setDone] = useState(new Set(["自动粗剪", "自动字幕"]));
  const [feedback, showFeedback] = useInlineFeedback();

  function toggle(op) {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(op)) next.delete(op); else next.add(op);
      return next;
    });
    showFeedback(`已${done.has(op) ? "撤销" : "执行"} ${op}`);
  }

  return (
    <Card title="AI剪辑工作台" action={feedback ? <span className="st-inline-feedback">{feedback}</span> : <DemoBadge />}>
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {["素材轨", "视频轨", "音频轨", "字幕轨", "BGM轨", "转场", "节奏点"].map((t) => <Pill key={t} tone="neutral">{t}</Pill>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 10 }}>
        {EDITING_OPERATIONS.map((op) => (
          <button
            key={op}
            type="button"
            onClick={() => toggle(op)}
            className="st-btn"
            style={{ justifyContent: "flex-start", background: done.has(op) ? "var(--st-accent-bg, rgba(13,148,136,.1))" : undefined, borderColor: done.has(op) ? "var(--st-accent, #0D9488)" : undefined }}
          >
            {done.has(op) ? "✓ " : ""}{op}
          </button>
        ))}
      </div>
      <div className="st-btn-row" style={{ marginTop: 16 }}>
        <button type="button" className="st-btn" onClick={() => showFeedback("已生成预览")}>预览</button>
        <button type="button" className="st-btn" onClick={() => showFeedback("已导出成片（演示）")}>导出</button>
        <button type="button" className="st-btn st-btn--primary" onClick={() => showFeedback("已提交内容审核")}>提交审核</button>
      </div>
    </Card>
  );
}

/* ============================ 配音 / 字幕 / BGM ============================ */

const VOICE_PROFILES = [
  { id: "v1", name: "沉稳青年音（周启）", type: "克隆音色", status: "已就绪" },
  { id: "v2", name: "清亮少女音（林晚）", type: "克隆音色", status: "已就绪" },
  { id: "v3", name: "低沉中年音（陆总）", type: "标准音色库", status: "已就绪" },
];

const BGM_LIBRARY = ["逆袭情绪版", "悬疑铺垫版", "温馨治愈版", "商业观察节奏版"];

export function VoiceSubtitleBgmPage() {
  const [subtitleOn, setSubtitleOn] = useState(true);
  const [selectedBgm, setSelectedBgm] = useState(BGM_LIBRARY[0]);
  const [feedback, showFeedback] = useInlineFeedback();

  return (
    <Card title="配音 / 字幕 / BGM" action={feedback ? <span className="st-inline-feedback">{feedback}</span> : <DemoBadge />}>
      <Card title="配音 · 声音克隆音色库">
        <Table
          columns={[
            { key: "name", label: "音色" }, { key: "type", label: "类型" }, { key: "status", label: "状态", render: (r) => <Pill tone="success">{r.status}</Pill> },
            { key: "actions", label: "操作", render: (r) => <button type="button" className="st-btn st-btn-sm" onClick={() => showFeedback(`已试听 ${r.name}`)}>试听</button> },
          ]}
          rows={VOICE_PROFILES}
        />
      </Card>
      <Card title="字幕">
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={subtitleOn} onChange={(e) => { setSubtitleOn(e.target.checked); showFeedback(e.target.checked ? "已开启自动字幕" : "已关闭自动字幕"); }} />
          自动生成字幕
        </label>
      </Card>
      <Card title="BGM 库">
        <div className="st-btn-row">
          {BGM_LIBRARY.map((bgm) => (
            <button key={bgm} type="button" className={`st-tab${selectedBgm === bgm ? " active" : ""}`} onClick={() => { setSelectedBgm(bgm); showFeedback(`已选择 BGM：${bgm}`); }}>{bgm}</button>
          ))}
        </div>
      </Card>
    </Card>
  );
}

/* ============================ 内容审核 ============================ */

const REVIEW_CHECKS = [
  "平台规则检查", "违禁词检查", "版权检查", "音乐版权", "人物肖像风险", "品牌规范检查",
  "商品信息检查", "AI生成内容标识", "重复度检查", "敏感内容检查",
];

export function ContentReviewPage() {
  const [results, setResults] = useState(() => Object.fromEntries(REVIEW_CHECKS.map((c) => [c, "pass"])));
  const [opinion, setOpinion] = useState("");
  const [feedback, showFeedback] = useInlineFeedback();

  function toggleResult(check) {
    setResults((r) => ({ ...r, [check]: r[check] === "pass" ? "fail" : "pass" }));
  }

  const allPass = Object.values(results).every((v) => v === "pass");

  return (
    <Card title="内容审核" action={feedback ? <span className="st-inline-feedback">{feedback}</span> : <DemoBadge />}>
      <Table
        columns={[
          { key: "check", label: "检查项" },
          { key: "result", label: "结果", render: (r) => <Pill tone={results[r.check] === "pass" ? "success" : "danger"}>{results[r.check] === "pass" ? "通过" : "未通过"}</Pill> },
          { key: "actions", label: "操作", render: (r) => <button type="button" className="st-btn st-btn-sm" onClick={() => toggleResult(r.check)}>切换结果</button> },
        ]}
        rows={REVIEW_CHECKS.map((c) => ({ id: c, check: c }))}
      />
      <Field label="审核意见"><textarea value={opinion} onChange={(e) => setOpinion(e.target.value)} placeholder="填写人工审核意见…" /></Field>
      <div className="st-btn-row">
        <button type="button" className="st-btn" onClick={() => showFeedback("已驳回，等待修改后重审")}>驳回</button>
        <button type="button" className="st-btn" onClick={() => showFeedback("已提交修改后重审")}>修改后重审</button>
        <button type="button" className="st-btn st-btn--primary" disabled={!allPass} onClick={() => showFeedback("已批准发布")}>
          {allPass ? "批准发布" : "存在未通过项，无法批准"}
        </button>
      </div>
    </Card>
  );
}
