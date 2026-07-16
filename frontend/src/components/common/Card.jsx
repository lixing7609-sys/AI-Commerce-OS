function Card({
  title,
  children,
  action,
}) {
  return (
    <div className="os-card">

      {(title || action) && (
        <div className="os-card-header">

          <div className="os-card-title">
            {title}
          </div>

          <div>
            {action}
          </div>

        </div>
      )}

      <div className="os-card-body">
        {children}
      </div>

    </div>
  );
}

export default Card;