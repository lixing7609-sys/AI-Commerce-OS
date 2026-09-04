import { KeyValueList } from "./KeyValueList.jsx";
import { Badge } from "./Badge.jsx";

const STATUS_TONES = {
  published: "success",
  draft: "neutral",
};

export function AssetVersion({ version, updatedAt, status }) {
  return (
    <div className="fdr-asset-version">
      {status ? (
        <Badge tone={STATUS_TONES[status] || "neutral"}>{status}</Badge>
      ) : null}
      <KeyValueList
        items={[
          { label: "版本", value: version },
          { label: "更新时间", value: updatedAt },
        ]}
      />
    </div>
  );
}
