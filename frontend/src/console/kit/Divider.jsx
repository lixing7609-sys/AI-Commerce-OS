export function Divider({ orientation = "horizontal" }) {
  if (orientation === "vertical") {
    return <div className="fdr-divider--vertical" role="separator" aria-orientation="vertical" />;
  }
  return <hr className="fdr-divider" />;
}
