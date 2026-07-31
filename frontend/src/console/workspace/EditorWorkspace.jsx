import "./workspace.css";

/**
 * Editor Workspace — Prompt/Skill/剧本/图文/商品详情/品牌规范编辑。
 *
 * 语法：左侧条目列表 + 中央正文编辑区 + 右侧属性栏（版本/变量/审批/
 * 关联 Agent）——三栏编辑器结构，不是"列表页 + 新建弹窗"。
 */
export function EditorWorkspace({ title, subtitle, actions, items, activeItemId, onSelectItem, children, properties }) {
  return (
    <div className="ws-shell">
      <div className="ws-header">
        <div className="ws-header__text">
          <h1 className="ws-header__title">{title}</h1>
          {subtitle ? <p className="ws-header__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="ws-header__actions">{actions}</div> : null}
      </div>
      <div className="ws-body">
        {items ? (
          <div className="ws-editor__list">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={"ws-editor__list-item" + (item.id === activeItemId ? " ws-editor__list-item--active" : "")}
                onClick={() => onSelectItem?.(item.id)}
              >
                <div className="ws-editor__list-item-title">{item.label}</div>
                {item.meta ? <div className="ws-editor__list-item-meta">{item.meta}</div> : null}
              </button>
            ))}
          </div>
        ) : null}
        <div className="ws-editor__main">
          <div className="ws-editor__surface">{children}</div>
        </div>
        {properties ? <div className="ws-editor__properties">{properties}</div> : null}
      </div>
    </div>
  );
}

export function EditorField({ label, children }) {
  return (
    <div className="ws-editor__field">
      <span className="ws-editor__field-label">{label}</span>
      {children}
    </div>
  );
}
