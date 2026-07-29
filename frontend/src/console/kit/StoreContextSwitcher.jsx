import { Select } from "./Select.jsx";

export function StoreContextSwitcher({ stores = [], activeStoreId, onChange }) {
  return (
    <div className="fdr-store-switcher">
      <Select
        options={stores.map((s) => ({ value: s.id, label: s.name }))}
        value={activeStoreId}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </div>
  );
}
