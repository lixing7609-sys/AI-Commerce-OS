export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="fdr-page-header">
      <div>
        <h1 className="fdr-page-header__title">{title}</h1>
        {subtitle ? <p className="fdr-page-header__subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="fdr-page-header__actions">{actions}</div> : null}
    </div>
  );
}
