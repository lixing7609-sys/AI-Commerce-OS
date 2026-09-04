import { useEffect, useState } from "react";
import { api } from "@sinofut/domain";

function computeStatus(state) {
  if (!state) return { status: "normal", unreadCount: 0 };
  const pendingApprovals = state.approvals.filter((a) => a.status === "pending");
  if (pendingApprovals.length > 0) {
    return { status: "alert", unreadCount: pendingApprovals.length };
  }
  const openTasks = state.tasks.filter((t) => t.status !== "done");
  if (openTasks.length > 0) return { status: "suggestion", unreadCount: openTasks.length };
  return { status: "normal", unreadCount: 0 };
}

// Floating entry point — V2-002 §3: clicking it opens the full SinoWorkspace
// (see sino/SinoWorkspace.jsx) rather than a small popup, since SinoFUT is now
// the system's singular AI entry, not a corner widget with its own mini-UI.
export function SinoFUTWidget({ onOpen, stacked = false }) {
  const [state, setState] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      api
        .getState()
        .then((s) => {
          if (!cancelled) setState(s);
        })
        .catch(() => {
          if (!cancelled) setState(null);
        });
    };
    poll();
    const timer = setInterval(poll, 6000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const { status, unreadCount } = computeStatus(state);

  return (
    <div className={`sf-floating${stacked ? " is-stacked" : ""}`}>
      <button type="button" className="sf-floating-pill" onClick={onOpen}>
        <span className={`sf-floating-dot status-${status}`} />
        Sino
        {unreadCount > 0 ? <span className="sf-floating-badge">{unreadCount}</span> : null}
      </button>
    </div>
  );
}
