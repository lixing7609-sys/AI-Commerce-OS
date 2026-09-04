import { useState } from "react";

/**
 * "开发信息"折叠区（阶段：产品原型）。
 *
 * 默认折叠（defaultOpen=false）；Task ID、root_task_id、
 * parent_task_id、原始 JSON、Provider、Model、Usage、技术错误等
 * 开发字段只在展开后才展示，经营者正常操作路径中不会看到。
 */
function DevInfoCollapse({ fields = [], rawJson, title = "开发信息" }) {
  const [open, setOpen] = useState(false);

  const hasContent = fields.length > 0 || rawJson !== undefined;

  if (!hasContent) {
    return null;
  }

  return (
    <div className="op-dev-info">
      <button
        type="button"
        className="op-dev-info-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? "收起" : "展开"}{title}
      </button>

      {open && (
        <div className="op-dev-info-body">
          {fields.length > 0 && (
            <dl className="op-dev-info-fields">
              {fields.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value ?? "—"}</dd>
                </div>
              ))}
            </dl>
          )}

          {rawJson !== undefined && (
            <pre className="op-dev-info-json">{JSON.stringify(rawJson, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  );
}

export default DevInfoCollapse;
