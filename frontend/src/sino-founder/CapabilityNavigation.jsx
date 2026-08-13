export function CapabilityNavigation({ active, onNavigate }) {
  const selected = ["home", "conversation", "project"].includes(active);
  return <nav className="sino-capability-nav" aria-label="Founder AI 能力入口"><button className={selected ? "is-active" : ""} onClick={() => onNavigate("home")}>Sino Founder AI</button></nav>;
}
