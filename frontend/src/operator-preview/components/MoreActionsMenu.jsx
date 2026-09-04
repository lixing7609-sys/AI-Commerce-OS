import { useState } from "react";

/**
 * "更多操作"下拉菜单（阶段：产品原型）。
 *
 * 下载 PDF/Word/Excel/Markdown、查看 JSON 等次级操作统一收进这里，
 * 不再和"批准/驳回"等主操作平铺展示——这是本次交互顺序修正的
 * 核心之一：先阅读业务结果，导出是次要动作。
 */
function MoreActionsMenu({ actions = [], onPrototypeAction }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="op-more-actions">
      <button
        type="button"
        className="op-btn"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        更多操作 {open ? "▲" : "▼"}
      </button>

      {open && (
        <div className="op-more-actions-menu" role="menu">
          {actions.map((action) => (
            <button
              type="button"
              key={action}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onPrototypeAction(action);
              }}
            >
              {action}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default MoreActionsMenu;
