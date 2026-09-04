import { StatusPill } from "./StatusPill.jsx";
import { TextButton } from "./TextButton.jsx";

export function VersionStatus({ currentVersion, latestVersion, onViewUpdate }) {
  const hasUpdate = Boolean(latestVersion && latestVersion !== currentVersion);

  return (
    <div className="fdr-version-status">
      <span>{currentVersion}</span>
      {hasUpdate ? (
        <>
          <StatusPill tone="warning">有更新</StatusPill>
          <TextButton onClick={onViewUpdate}>查看更新</TextButton>
        </>
      ) : null}
    </div>
  );
}
