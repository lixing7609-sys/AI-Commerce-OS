import { Switch } from "./Switch.jsx";
import { KeyValueList } from "./KeyValueList.jsx";

export function AutomationPolicy({ name, enabled, onToggle, conditions }) {
  return (
    <div className="fdr-automation-policy">
      <div className="fdr-automation-policy__header">
        <span className="fdr-type-heading-card">{name}</span>
        <Switch checked={enabled} onChange={onToggle} />
      </div>
      {conditions && conditions.length > 0 ? (
        <KeyValueList items={conditions} />
      ) : null}
    </div>
  );
}
