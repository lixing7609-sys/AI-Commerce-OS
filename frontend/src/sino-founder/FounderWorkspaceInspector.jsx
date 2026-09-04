export function FounderWorkspaceInspector({ title, description, children }) {
  return <div className="sino-workspace-inspector">
    {children || <div className="sino-inspector-empty"><h2>{title}</h2><p>{description}</p></div>}
  </div>;
}
