import { useCallback, useRef, useState } from "react";
import { ToastContext } from "./toastContext.js";

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const showToast = useCallback((message, tone = "default") => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3200);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="fdr-toast-host">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={
              "fdr-toast" + (toast.tone !== "default" ? ` fdr-toast--${toast.tone}` : "")
            }
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
