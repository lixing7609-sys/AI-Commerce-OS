import { useState } from "react";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { getProductStatusLabel, bulkSetStatus } from "../../mock/productMock.js";

const STATUS_TONE = { active: "success", draft: "neutral", out_of_stock: "danger" };

export function ProductListView({ products, storeId, onChange, onCreate }) {
  const { navigate } = useConsoleNavContext();
  const [selected, setSelected] = useState([]);

  function toggleSelect(id) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function bulkPublish() {
    onChange(bulkSetStatus(selected, "active"));
    setSelected([]);
  }

  return (
    <div className="fdr-card">
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
        {selected.length > 0 ? (
          <Button variant="secondary" onClick={bulkPublish}>批量发布（{selected.length}）</Button>
        ) : null}
        <Button variant="primary" onClick={onCreate}>+ 新建商品</Button>
      </div>
      <DataTable
        columns={[
          {
            key: "select",
            label: "",
            render: (row) => (
              <input
                type="checkbox"
                checked={selected.includes(row.id)}
                onChange={(e) => {
                  e.stopPropagation();
                  toggleSelect(row.id);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ),
          },
          { key: "title", label: "商品" },
          { key: "sku", label: "SKU" },
          { key: "category", label: "类目" },
          { key: "price", label: "售价", render: (r) => `¥${r.price}` },
          { key: "stock", label: "库存" },
          {
            key: "status",
            label: "状态",
            render: (r) => <StatusPill tone={STATUS_TONE[r.status]}>{getProductStatusLabel(r.status)}</StatusPill>,
          },
        ]}
        rows={products}
        onRowClick={(row) => navigate("productCenter", { subView: storeId, entityId: row.id })}
        emptyMessage="该类目下暂无商品，点击“新建商品”开始"
      />
    </div>
  );
}
