import { EmptyState } from "./EmptyState.jsx";

/**
 * 通用表格：columns = [{key, label, render?(row)}], rows = [...],
 * onRowClick?(row) 可选。约 12/16 个模块的列表页共用这一个组件，
 * 避免每个模块各写一份表格 CSS/结构。
 */
export function DataTable({ columns, rows, onRowClick, emptyMessage = "暂无数据" }) {
  if (!rows || rows.length === 0) {
    return <EmptyState icon="▢" message={emptyMessage} />;
  }

  return (
    <div className="fdr-table-wrap">
      <table className="fdr-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={row.id ?? idx}
              data-clickable={onRowClick ? "true" : "false"}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((col) => (
                <td key={col.key}>{col.render ? col.render(row) : row[col.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
