import { useState } from "react";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill } from "../../kit/StatusPill.jsx";
import { DEMO_STORES, getStoreName } from "../../mock/storesMock.js";
import { getContentState } from "../../mock/contentMock.js";

export function ContentAssetLibrary() {
  const [state] = useState(() => getContentState());
  const [storeFilter, setStoreFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const types = [...new Set(state.contentAssets.map((a) => a.assetType))];
  const assets = state.contentAssets.filter((a) => {
    if (storeFilter && a.storeId !== storeFilter) return false;
    if (typeFilter && a.assetType !== typeFilter) return false;
    return true;
  });

  return (
    <div>
      <div className="fdr-card">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select className="fdr-select" style={{ maxWidth: 160 }} value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)}>
            <option value="">全部店铺</option>
            {DEMO_STORES.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select className="fdr-select" style={{ maxWidth: 160 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">全部资产类型</option>
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="fdr-card">
        <DataTable
          columns={[
            { key: "name", label: "资产名称" },
            { key: "storeId", label: "店铺", render: (r) => getStoreName(r.storeId) },
            { key: "product", label: "商品", render: (r) => r.product ?? "—" },
            { key: "assetType", label: "类型" },
            { key: "source", label: "来源" },
            { key: "authorizationStatus", label: "授权状态", render: (r) => <StatusPill tone={r.authorizationStatus.includes("已授权") || r.authorizationStatus === "无需授权" ? "success" : "warning"}>{r.authorizationStatus}</StatusPill> },
            { key: "owner", label: "所有者" },
            { key: "version", label: "版本", render: (r) => `v${r.version}` },
            { key: "generatedBy", label: "生成方" },
            { key: "tokenCost", label: "Token 成本" },
            { key: "copyrightResult", label: "版权结果" },
            { key: "reuseCount", label: "复用次数" },
            { key: "createdAt", label: "创建时间", render: (r) => new Date(r.createdAt).toLocaleDateString("zh-CN") },
          ]}
          rows={assets}
          emptyMessage="当前筛选条件下暂无资产"
        />
      </div>
    </div>
  );
}
