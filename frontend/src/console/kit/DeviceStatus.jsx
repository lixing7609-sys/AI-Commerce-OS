import { StatusPill } from "./StatusPill.jsx";

export function DeviceStatus({ deviceName, online, lastSeen }) {
  return (
    <div className="fdr-device-status">
      <span>{deviceName}</span>
      <StatusPill tone={online ? "success" : "neutral"}>
        {online ? "在线" : "离线"}
      </StatusPill>
      {lastSeen ? <span className="fdr-type-metadata">{lastSeen}</span> : null}
    </div>
  );
}
