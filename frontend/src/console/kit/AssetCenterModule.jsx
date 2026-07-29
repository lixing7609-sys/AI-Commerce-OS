import { useMemo, useState } from "react";
import { PageHeader } from "./PageHeader.jsx";
import { StatCard, StatGrid } from "./StatCard.jsx";
import { DataTable } from "./DataTable.jsx";
import { StatusPill, DemoBadge } from "./StatusPill.jsx";
import { Button } from "./Button.jsx";
import { ConfirmModal } from "./Modal.jsx";
import { EmptyState } from "./EmptyState.jsx";
import { useToast } from "./useToast.js";
import { useConsoleNavContext } from "../nav/ConsoleNavContext.jsx";
import { ASSET_STATUS, ASSET_STATUS_LABEL, ASSET_STATUS_TONE } from "../shared/assetDomain.js";

const ALL = "all";

/**
 * 通用资产中心骨架——Founder 的 Prompt 中心/Skill 中心/Knowledge
 * 中心/Connector 中心共用同一个组件（阶段 Founder Full-System v3
 * Batch 2 §F："使用共享资产领域模型和仓库适配层，不创建纯文字
 * 页面"）。每个中心只传入自己的 `repo`（`createAssetRepository()`
 * 的实例）和 `fieldSchema`（详情/编辑表单里除通用字段外还要展示/
 * 编辑哪些专属字段），列表/详情/新建/编辑/搜索/筛选/空状态/错误
 * 状态/加载状态/统一 ID 与时间戳全部由这里统一实现，不是四份各自
 * 实现的相似代码。
 *
 * `subView` 语义：未设置或 "list" = 列表；"create" = 新建表单；
 * 其它任意值当作资产 id，进入详情/编辑视图。
 */
export function AssetCenterModule({ moduleKey, title, subtitle, repo, fieldSchema = [], emptyMessage, itemLabel = "资产" }) {
  const toast = useToast();
  const { subView, navigate } = useConsoleNavContext();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [, forceRerender] = useState(0);

  const view = !subView || subView === "list" ? "list" : subView === "create" ? "create" : "detail";
  const rows = useMemo(
    () => repo.list({ search, status: statusFilter }),
    [search, statusFilter, forceRerender] // eslint-disable-line react-hooks/exhaustive-deps
  );

  function refresh() {
    forceRerender((n) => n + 1);
  }

  function goList() {
    navigate(moduleKey, { subView: "list" });
  }

  if (view === "create" || view === "detail") {
    const editingAsset = view === "detail" ? repo.get(subView) : null;
    if (view === "detail" && !editingAsset) {
      return (
        <div>
          <PageHeader title={title} subtitle={subtitle} actions={<Button variant="ghost" onClick={goList}>← 返回列表</Button>} />
          <EmptyState icon="⚠" message={`未找到该${itemLabel}（可能已被删除）`} action={<Button variant="secondary" onClick={goList}>返回列表</Button>} />
        </div>
      );
    }
    return (
      <AssetFormView
        title={title}
        itemLabel={itemLabel}
        fieldSchema={fieldSchema}
        asset={editingAsset}
        onCancel={goList}
        onSave={(draft) => {
          if (editingAsset) {
            repo.update(editingAsset.id, draft);
            toast(`${itemLabel}已更新`, "success");
          } else {
            repo.create(draft);
            toast(`${itemLabel}已创建`, "success");
          }
          refresh();
          goList();
        }}
      />
    );
  }

  const stats = {
    total: rows.length,
    published: rows.filter((a) => a.status === ASSET_STATUS.PUBLISHED).length,
    draft: rows.filter((a) => a.status === ASSET_STATUS.DRAFT).length,
  };

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <DemoBadge />
            <Button variant="primary" onClick={() => navigate(moduleKey, { subView: "create" })}>+ 新建{itemLabel}</Button>
          </div>
        }
      />

      <StatGrid>
        <StatCard label={`${itemLabel}总数`} value={stats.total} />
        <StatCard label="已发布" value={stats.published} onClick={() => setStatusFilter(ASSET_STATUS.PUBLISHED)} />
        <StatCard label="草稿" value={stats.draft} onClick={() => setStatusFilter(ASSET_STATUS.DRAFT)} />
      </StatGrid>

      <div className="fdr-card" style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input className="fdr-input" placeholder={`搜索${itemLabel}名称 / 描述`} value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 220 }} />
        <select className="fdr-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value={ALL}>全部状态</option>
          {Object.values(ASSET_STATUS).map((s) => (
            <option key={s} value={s}>{ASSET_STATUS_LABEL[s]}</option>
          ))}
        </select>
      </div>

      <div className="fdr-card">
        {rows.length === 0 ? (
          <EmptyState icon="▤" message={emptyMessage ?? (search || statusFilter !== ALL ? `没有匹配当前筛选条件的${itemLabel}` : `暂无${itemLabel}，点击右上角「新建${itemLabel}」开始`)} />
        ) : (
          <DataTable
            columns={[
              { key: "name", label: "名称" },
              { key: "description", label: "描述", render: (r) => r.description || "—" },
              { key: "version", label: "版本", render: (r) => `v${r.version}` },
              { key: "status", label: "状态", render: (r) => <StatusPill tone={ASSET_STATUS_TONE[r.status]}>{ASSET_STATUS_LABEL[r.status]}</StatusPill> },
              { key: "updatedAt", label: "更新时间", render: (r) => new Date(r.updatedAt).toLocaleString("zh-CN") },
              {
                key: "actions",
                label: "操作",
                render: (r) => (
                  <div style={{ display: "flex", gap: 4 }}>
                    <Button size="sm" variant="secondary" onClick={() => navigate(moduleKey, { subView: r.id })}>详情</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(r)}>删除</Button>
                  </div>
                ),
              },
            ]}
            rows={rows}
          />
        )}
      </div>

      <ConfirmModal
        open={!!confirmDelete}
        title={`删除${itemLabel}`}
        message={`确认删除「${confirmDelete?.name}」吗？此操作不可撤销。`}
        confirmLabel="删除"
        danger
        onConfirm={() => {
          repo.remove(confirmDelete.id);
          toast(`已删除`, "success");
          refresh();
        }}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
}

function emptyDraftFromSchema(fieldSchema) {
  const fields = {};
  for (const f of fieldSchema) fields[f.key] = f.default ?? "";
  return { name: "", description: "", status: ASSET_STATUS.DRAFT, tags: [], fields };
}

function AssetFormView({ title, itemLabel, fieldSchema, asset, onCancel, onSave }) {
  const [draft, setDraft] = useState(() =>
    asset
      ? { name: asset.name, description: asset.description, status: asset.status, tags: asset.tags ?? [], fields: { ...asset.fields } }
      : emptyDraftFromSchema(fieldSchema)
  );

  function patchField(key, value) {
    setDraft((prev) => ({ ...prev, fields: { ...prev.fields, [key]: value } }));
  }

  return (
    <div>
      <PageHeader
        title={asset ? `编辑${itemLabel} · ${asset.name}` : `新建${itemLabel}`}
        subtitle={title}
        actions={<Button variant="ghost" onClick={onCancel}>← 返回列表</Button>}
      />
      <div className="fdr-card">
        <div className="fdr-field">
          <label className="fdr-field__label">名称</label>
          <input className="fdr-input" value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} placeholder={`${itemLabel}名称`} />
        </div>
        <div className="fdr-field">
          <label className="fdr-field__label">描述</label>
          <textarea className="fdr-textarea" value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))} placeholder="这个资产做什么、适用于哪些场景" />
        </div>
        <div className="fdr-field">
          <label className="fdr-field__label">状态</label>
          <select className="fdr-select" value={draft.status} onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value }))}>
            {Object.values(ASSET_STATUS).map((s) => (
              <option key={s} value={s}>{ASSET_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>

        {fieldSchema.map((f) => (
          <div className="fdr-field" key={f.key}>
            <label className="fdr-field__label">{f.label}</label>
            {f.type === "textarea" ? (
              <textarea className="fdr-textarea" value={draft.fields[f.key] ?? ""} onChange={(e) => patchField(f.key, e.target.value)} placeholder={f.placeholder} />
            ) : f.type === "select" ? (
              <select className="fdr-select" value={draft.fields[f.key] ?? ""} onChange={(e) => patchField(f.key, e.target.value)}>
                {(f.options ?? []).map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <input className="fdr-input" value={draft.fields[f.key] ?? ""} onChange={(e) => patchField(f.key, e.target.value)} placeholder={f.placeholder} />
            )}
          </div>
        ))}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <Button variant="secondary" onClick={onCancel}>取消</Button>
          <Button variant="primary" disabled={!draft.name.trim()} onClick={() => onSave(draft)}>保存</Button>
        </div>
      </div>
    </div>
  );
}
