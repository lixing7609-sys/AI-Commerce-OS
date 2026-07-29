import { useEffect, useRef, useState } from "react";

export function Tooltip({ content, children }) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  function show() {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(true), 200);
  }

  function hide() {
    clearTimeout(timerRef.current);
    setVisible(false);
  }

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    function handleKey(event) {
      if (event.key === "Escape") hide();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [visible]);

  return (
    <span
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible ? (
        <div
          role="tooltip"
          className="fdr-tooltip"
          style={{ bottom: "100%", left: "50%", transform: "translateX(-50%)", marginBottom: 6 }}
        >
          {content}
        </div>
      ) : null}
    </span>
  );
}
