import { useState } from "react";
import { NEW_PROJECT_CONTENT_TYPE_OPTIONS, NEW_PROJECT_MONETIZATION_OPTIONS, createContentProject, getIpList } from "../mock/studioMock.js";
import { GRAPHIC_TYPE_LABEL, createGraphicContentProject } from "../mock/graphicContentMock.js";
import { Field, Modal } from "./uiHelpers.jsx";

/**
 * 新建内容项目工作台（§九）——Studio 正式生产入口，不是"创建按钮"
 * 的占位表单。提交后：
 *   - contentType==="graphic" 时调用 createGraphicContentProject，
 *     交由调用方跳转到 AI图文编辑器；
 *   - 其它类型调用 createContentProject，交由调用方跳转到 AI导演
 *     工作台——两条路径共用同一个表单和同一个"进入生产"心智模型，
 *     不是两套互不相关的创建流程。
 */
export function ProjectCreationModal({ open, onClose, presetType, presetTrendId, presetIpId, onCreated }) {
  const ipList = getIpList();
  const [form, setForm] = useState(() => ({
    name: "", contentType: presetType === "graphic" ? "graphic" : presetType || "shortdrama",
    graphicType: "wechat_article", targetPlatform: "", targetAccount: "", targetAudience: "",
    contentGoal: "", monetizationModel: "revenue_share", contentCount: 1, videoDuration: "60秒",
    contentStyle: "", relatedProductId: "", relatedBrandId: "", relatedTrendId: presetTrendId || "",
    ipId: presetIpId || "", budgetCap: 10000, deadline: "", automationLevel: "半自动（关键节点人工确认）",
    humanReviewNodes: "内容审核", notes: "",
  }));
  const [submitting, setSubmitting] = useState(false);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      if (form.contentType === "graphic") {
        const project = await createGraphicContentProject({
          name: form.name || `${GRAPHIC_TYPE_LABEL[form.graphicType]} · 新项目`,
          graphicType: form.graphicType, ipId: form.ipId || null, relatedProductId: form.relatedProductId || null,
          relatedTrendId: form.relatedTrendId || null, targetPlatforms: [form.targetPlatform || "wechat"],
          monetizationModel: NEW_PROJECT_MONETIZATION_OPTIONS.find((o) => o.value === form.monetizationModel)?.label ?? form.monetizationModel,
          budgetCap: form.budgetCap, deadline: form.deadline,
        });
        onCreated({ project, isGraphic: true });
      } else {
        const project = await createContentProject({
          name: form.name || "新内容项目", contentType: form.contentType, ipId: form.ipId || null,
          targetPlatform: form.targetPlatform, targetAccount: form.targetAccount, targetAudience: form.targetAudience,
          contentGoal: form.contentGoal, monetizationModel: form.monetizationModel, contentCount: form.contentCount,
          videoDuration: form.videoDuration, contentStyle: form.contentStyle, relatedProductId: form.relatedProductId || null,
          relatedBrandId: form.relatedBrandId || null, relatedTrendId: form.relatedTrendId || null,
          budgetCap: form.budgetCap, deadline: form.deadline, automationLevel: form.automationLevel,
          humanReviewNodes: form.humanReviewNodes.split(/[,，]/).map((s) => s.trim()).filter(Boolean), notes: form.notes,
        });
        onCreated({ project, isGraphic: false });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} title="新建内容项目 · 从热点、商品、IP或自定义创意开始" onClose={onClose} width={760}>
      <div className="st-field-row">
        <Field label="项目名称"><input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="例如：红果女性重生短剧 · 新项目" /></Field>
        <Field label="内容类型">
          <select value={form.contentType} onChange={(e) => set("contentType", e.target.value)}>
            {NEW_PROJECT_CONTENT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
      </div>
      {form.contentType === "graphic" ? (
        <Field label="图文类型">
          <select value={form.graphicType} onChange={(e) => set("graphicType", e.target.value)}>
            {Object.entries(GRAPHIC_TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
      ) : null}
      <div className="st-field-row">
        <Field label="目标平台"><input value={form.targetPlatform} onChange={(e) => set("targetPlatform", e.target.value)} placeholder="例如：红果 + 抖音矩阵" /></Field>
        <Field label="目标账号"><input value={form.targetAccount} onChange={(e) => set("targetAccount", e.target.value)} placeholder="例如：重生豪门官方" /></Field>
        <Field label="目标受众"><input value={form.targetAudience} onChange={(e) => set("targetAudience", e.target.value)} placeholder="例如：都市女性 25-35岁" /></Field>
        <Field label="关联 IP">
          <select value={form.ipId} onChange={(e) => set("ipId", e.target.value)}>
            <option value="">不关联</option>
            {ipList.map((ip) => <option key={ip.ipId} value={ip.ipId}>{ip.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="st-field-row">
        <Field label="变现模式">
          <select value={form.monetizationModel} onChange={(e) => set("monetizationModel", e.target.value)}>
            {NEW_PROJECT_MONETIZATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="内容数量"><input type="number" min="1" value={form.contentCount} onChange={(e) => set("contentCount", e.target.value)} /></Field>
        <Field label="视频时长"><input value={form.videoDuration} onChange={(e) => set("videoDuration", e.target.value)} placeholder="60-90秒" /></Field>
        <Field label="内容风格"><input value={form.contentStyle} onChange={(e) => set("contentStyle", e.target.value)} placeholder="情绪爽剧 / 真实种草…" /></Field>
      </div>
      <div className="st-field-row">
        <Field label="关联商品ID"><input value={form.relatedProductId} onChange={(e) => set("relatedProductId", e.target.value)} placeholder="选填" /></Field>
        <Field label="关联品牌ID"><input value={form.relatedBrandId} onChange={(e) => set("relatedBrandId", e.target.value)} placeholder="选填" /></Field>
        <Field label="关联热点ID"><input value={form.relatedTrendId} onChange={(e) => set("relatedTrendId", e.target.value)} placeholder="选填，可从热点分析中心带入" /></Field>
        <Field label="预算上限"><input type="number" value={form.budgetCap} onChange={(e) => set("budgetCap", e.target.value)} /></Field>
      </div>
      <div className="st-field-row">
        <Field label="截止时间"><input type="date" value={form.deadline} onChange={(e) => set("deadline", e.target.value)} /></Field>
        <Field label="自动化等级">
          <select value={form.automationLevel} onChange={(e) => set("automationLevel", e.target.value)}>
            <option>全自动（异常自动转人工）</option>
            <option>半自动（关键节点人工确认）</option>
            <option>人工主导（Agent 仅辅助）</option>
          </select>
        </Field>
        <Field label="人工审核节点"><input value={form.humanReviewNodes} onChange={(e) => set("humanReviewNodes", e.target.value)} placeholder="分镜确认，内容审核" /></Field>
      </div>
      <Field label="内容目标 / 补充说明"><textarea value={form.contentGoal || form.notes} onChange={(e) => { set("contentGoal", e.target.value); set("notes", e.target.value); }} placeholder="女性逆袭、职场重生、强情绪钩子，24集，每集60-90秒。" /></Field>
      <button type="button" className="st-btn st-btn--primary" style={{ width: "100%" }} disabled={submitting} onClick={handleSubmit}>
        {submitting ? "Studio 秘书正在生成生产计划…" : "让 Studio 秘书创建完整生产计划"}
      </button>
    </Modal>
  );
}
