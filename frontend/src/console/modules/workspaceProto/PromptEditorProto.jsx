import { useMemo, useState } from "react";
import { EditorWorkspace, EditorField } from "../../workspace/EditorWorkspace.jsx";

const ITEMS = [
  { id: "p1", label: "商品详情文案生成", meta: "v1 · 已发布" },
  { id: "p2", label: "客服回复草稿", meta: "v1 · 已发布" },
  { id: "p3", label: "广告投放建议", meta: "v1 · 草稿" },
  { id: "p4", label: "短剧分镜脚本生成", meta: "v1 · 已发布" },
];

const TEMPLATES = {
  p1: "请为{{商品名称}}生成一段吸引人的详情页文案，突出{{核心卖点}}。",
  p2: "针对客户反馈「{{反馈内容}}」，生成一条礼貌、解决问题导向的回复草稿。",
  p3: "根据计划「{{计划名称}}」近 7 天 ROAS={{roas}}，生成投放调整建议。",
  p4: "根据选题「{{选题}}」和目标时长{{时长}}秒，生成分镜脚本初稿。",
};

function extractVariables(text) {
  const matches = text.match(/\{\{[^}]+\}\}/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

/**
 * 母版 D · Prompt Editor Workspace。
 * 三栏编辑器：左侧 Prompt 列表 / 中央正文编辑（真实可编辑 textarea，
 * 变量实时识别）/ 右侧属性栏（版本、审批状态、关联 Agent、变量）。
 */
export function PromptEditorProto() {
  const [activeId, setActiveId] = useState(ITEMS[0].id);
  const [drafts, setDrafts] = useState(TEMPLATES);
  const text = drafts[activeId] ?? "";
  const variables = useMemo(() => extractVariables(text), [text]);

  return (
    <EditorWorkspace
      title="Prompt 编辑器"
      subtitle="跨 Agent 复用的 Prompt 模板——正文与属性同屏编辑，不是列表页 + 弹窗"
      actions={<button type="button" className="ws-ops__toggle-btn ws-ops__toggle-btn--active">保存版本</button>}
      items={ITEMS}
      activeItemId={activeId}
      onSelectItem={setActiveId}
      properties={
        <>
          <EditorField label="版本">v1（保存后自动升为 v2）</EditorField>
          <EditorField label="审批状态"><span style={{ color: "var(--warning)" }}>待审批</span></EditorField>
          <EditorField label="关联 Agent">产品 Agent</EditorField>
          <EditorField label="适用版本">Founder</EditorField>
          <EditorField label="识别到的变量">
            {variables.length === 0 ? (
              <span style={{ color: "var(--text-tertiary)" }}>暂无 {"{{变量}}"}</span>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {variables.map((v) => (
                  <span key={v} style={{ fontSize: 12, padding: "2px 8px", borderRadius: 999, background: "var(--ai-accent-subtle)", color: "var(--ai-accent)" }}>
                    {v}
                  </span>
                ))}
              </div>
            )}
          </EditorField>
        </>
      }
    >
      <EditorField label="Prompt 模板正文">
        <textarea
          value={text}
          onChange={(e) => setDrafts((d) => ({ ...d, [activeId]: e.target.value }))}
          rows={10}
          style={{
            width: "100%",
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            lineHeight: 1.6,
            padding: 12,
            border: "1px solid var(--border-default)",
            borderRadius: 8,
            resize: "vertical",
          }}
        />
      </EditorField>
      <EditorField label="变量预览（用示例值渲染）">
        <div style={{ padding: 12, background: "var(--canvas-subtle)", borderRadius: 8, fontSize: 13, color: "var(--text-secondary)" }}>
          {text.replace(/\{\{[^}]+\}\}/g, (m) => `「示例·${m.slice(2, -2)}」`)}
        </div>
      </EditorField>
    </EditorWorkspace>
  );
}
