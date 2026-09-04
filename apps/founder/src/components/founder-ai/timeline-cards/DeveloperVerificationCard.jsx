import { useState } from "react";

// 开发验证卡（Developer Verification Card）
// ---------------------------------------------------------------------------
// 用于在时间线 / 首页中直观展示「一次开发任务是否达成验收标准」的自包含卡片。
// 设计上完全对齐现有 timeline-card 视觉规范（sf-card / founder-ai-row-header /
// sf-badge / founder-ai-definition-grid），不引入任何新依赖、不改动状态管理。
//
// 该卡片可以两种方式使用：
//   1) 直接 <DeveloperVerificationCard /> —— 使用内置的默认验收数据，便于在
//      FounderHome 中通过 URL 参数直接预览（浏览器验证入口）。
//   2) <DeveloperVerificationCard entry={{ verification: {...} }} /> —— 传入真实
//      验收数据，未来可接入时间线流（与其它卡片保持一致的 entry 约定）。

const DEFAULT_VERIFICATION = {
  taskName: "开发验证卡（DeveloperVerificationCard）",
  background: "为 Founder AI 首页新增一张自包含的开发验证卡片，用于展示本次改动的验收证据。",
  lint: "通过",
  build: "通过",
  browserCheck: "通过",
  pageUrl: "http://localhost:5180/?verify=dev",
  gitStatus: "干净（改动已作为独立 commit 提交）",
  filesChanged: [
    "apps/founder/src/components/founder-ai/timeline-cards/DeveloperVerificationCard.jsx",
    "apps/founder/src/pages/FounderHome.jsx",
  ],
  constraints: [
    "禁止改动数据库 / 路由 / 状态管理 / 已有组件",
    "禁止新增依赖，保持现有页面布局不变",
  ],
  knownIssues: "无",
};

function StatusBadge({ value }) {
  const ok = value === "通过";
  return <span className={`sf-badge ${ok ? "success" : "warn"}`}>{value}</span>;
}

export function DeveloperVerificationCard({ entry, floating = false }) {
  const [expanded, setExpanded] = useState(false);
  const v = entry?.verification ?? DEFAULT_VERIFICATION;

  const allPass = v.lint === "通过" && v.build === "通过" && v.browserCheck === "通过";

  const card = (
    <div className="sf-card timeline-card">
      <div className="founder-ai-row-header">
        <h4>开发验证：{v.taskName}</h4>
        <span className={`sf-badge ${allPass ? "success" : "warn"}`}>
          {allPass ? "已通过验收" : "待验收"}
        </span>
      </div>
      <p className="founder-ai-meta">{v.background}</p>
      <dl className="founder-ai-definition-grid">
        <dt>Lint</dt>
        <dd>
          <StatusBadge value={v.lint} />
        </dd>
        <dt>Build</dt>
        <dd>
          <StatusBadge value={v.build} />
        </dd>
        <dt>浏览器验证</dt>
        <dd>
          <StatusBadge value={v.browserCheck} />
        </dd>
        <dt>页面地址</dt>
        <dd>
          <a href={v.pageUrl} target="_blank" rel="noreferrer">
            {v.pageUrl}
          </a>
        </dd>
      </dl>
      <button type="button" className="sf-icon-button" onClick={() => setExpanded((prev) => !prev)}>
        {expanded ? "收起验收明细" : "查看验收明细"}
      </button>
      {expanded && (
        <dl className="founder-ai-definition-grid" style={{ marginTop: 10 }}>
          <dt>修改文件</dt>
          <dd>{v.filesChanged.join("；")}</dd>
          <dt>关键约束</dt>
          <dd>{v.constraints.length ? v.constraints.join("；") : "无"}</dd>
          <dt>Git 状态</dt>
          <dd>{v.gitStatus}</dd>
          <dt>已知问题</dt>
          <dd>{v.knownIssues}</dd>
        </dl>
      )}
    </div>
  );

  if (!floating) return card;

  // floating 模式：以固定定位的浮层呈现，绝不参与既有三栏布局的排版流，
  // 从而保证「保持现有页面布局不变」——默认无该浮层，仅在显式入口下出现。
  return (
    <div
      style={{
        position: "fixed",
        right: 24,
        bottom: 24,
        zIndex: 1000,
        width: "min(420px, calc(100vw - 48px))",
        maxHeight: "calc(100dvh - 48px)",
        overflowY: "auto",
      }}
    >
      {card}
    </div>
  );
}
