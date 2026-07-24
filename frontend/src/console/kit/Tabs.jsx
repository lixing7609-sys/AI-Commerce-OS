export function Tabs({ tabs, activeTab, onChange }) {
  return (
    <div className="fdr-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={
            "fdr-tabs__item" + (tab.key === activeTab ? " fdr-tabs__item--active" : "")
          }
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
