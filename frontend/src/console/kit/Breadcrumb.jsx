export function Breadcrumb({ items }) {
  return (
    <nav aria-label="Breadcrumb">
      <div className="fdr-breadcrumb">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <span key={item.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {index > 0 ? <span className="fdr-breadcrumb__sep">/</span> : null}
              {isLast ? (
                <span className="fdr-breadcrumb__current" aria-current="page">
                  {item.label}
                </span>
              ) : item.href ? (
                <a href={item.href}>{item.label}</a>
              ) : (
                <a
                  href="#"
                  onClick={(event) => {
                    event.preventDefault();
                    item.onClick?.();
                  }}
                >
                  {item.label}
                </a>
              )}
            </span>
          );
        })}
      </div>
    </nav>
  );
}
