export function getSystemHardware() {
  return { cpuPct: 34, memPct: 58, diskPct: 41, tempC: 52 };
}

export function getSystemContainers() {
  return [
    { name: "backend-api", status: "running", uptime: "3d 4h" },
    { name: "postgres", status: "running", uptime: "12d 1h" },
    { name: "n8n", status: "running", uptime: "3d 4h" },
  ];
}

export function getSystemLogs() {
  const now = Date.now();
  return [
    { ts: new Date(now - 60000).toISOString(), level: "info", source: "backend", message: "Task consumer heartbeat OK" },
    { ts: new Date(now - 300000).toISOString(), level: "warning", source: "runtime", message: "Auto-resume triggered after restart" },
    { ts: new Date(now - 900000).toISOString(), level: "info", source: "backend", message: "Deliverable auto-generation completed" },
  ];
}
