export function ContentPreview({ src, alt, title, aspectRatio = "4/3" }) {
  return (
    <div className="fdr-content-preview" style={{ aspectRatio }}>
      <img src={src} alt={alt} />
      {title ? <p className="fdr-type-body-small">{title}</p> : null}
    </div>
  );
}
