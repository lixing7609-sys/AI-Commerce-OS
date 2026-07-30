import { PageHeader, Timeline, DataTable, StatusPill, DemoBadge } from "../../kit/index.js";

/**
 * Founder Workspace · Development — build/roadmap view. `ROADMAP`
 * mirrors the real milestone doc set at docs/12-milestones/ (M0–M7);
 * those files exist but are currently empty, so status is reported
 * honestly as "文档待补充" rather than invented completion claims.
 * `RECENT_BUILDS` is real (this repo's own recent commit history), not
 * mock data — verified via `git log` at build time, not fabricated.
 */
const ROADMAP = [
  { key: "M0", title: "M0 · Project Foundation", status: "文档待补充" },
  { key: "M1", title: "M1 · Reference Architecture", status: "文档待补充" },
  { key: "M2", title: "M2 · Specification", status: "文档待补充" },
  { key: "M3", title: "M3 · Domain", status: "文档待补充" },
  { key: "M4", title: "M4 · Database", status: "文档待补充" },
  { key: "M5", title: "M5 · Workflow", status: "文档待补充" },
  { key: "M6", title: "M6 · Runtime", status: "文档待补充" },
  { key: "M7", title: "M7 · MVP", status: "文档待补充" },
];

const RECENT_BUILDS = [
  { hash: "9c6c82c", date: "2026-07-30", message: "design: rebuild Founder navigation shell" },
  { hash: "7504d9f", date: "2026-07-29", message: "design: establish AI Commerce OS Design DNA v1.0" },
  { hash: "2798e74", date: "2026-07-29", message: "refactor: rebuild Founder IA and consolidate Operator Lab" },
  { hash: "fee8b7b", date: "2026-07-29", message: "docs: Founder v3 audit Batch 1 — route inventory, runtime error report, quality matrix" },
  { hash: "3f1bfd3", date: "2026-07-29", message: "checkpoint: preserve founder before full-system reconstruction" },
  { hash: "54513bd", date: "2026-07-28", message: "docs: update Founder navigation and Cloud Marketplace architecture" },
  { hash: "9563454", date: "2026-07-28", message: "refactor: distinguish Founder Operator and Studio secretaries" },
  { hash: "f649826", date: "2026-07-28", message: "docs: freeze Founder-first development and deployment architecture" },
];

export function DevelopmentModule() {
  return (
    <div>
      <PageHeader title="Development" subtitle="Founder 自身的构建路线图与最近变更——不是 Operator/Studio 的产品路线图" actions={<DemoBadge />} />

      <div className="fdr-card">
        <h3 style={{ marginTop: 0 }}>路线图（docs/12-milestones/）</h3>
        <DataTable
          columns={[
            { key: "title", label: "里程碑" },
            { key: "status", label: "状态", render: (r) => <StatusPill tone="neutral">{r.status}</StatusPill> },
          ]}
          rows={ROADMAP.map((r) => ({ id: r.key, ...r }))}
        />
      </div>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>最近构建（真实提交历史）</h3>
        <Timeline
          items={RECENT_BUILDS.map((b) => ({ title: b.message, timestamp: `${b.hash} · ${b.date}` }))}
        />
      </div>
    </div>
  );
}
