import { useEffect } from "react";
import { Button } from "./Button.jsx";

export function Modal({ open, title, onClose, children, footer }) {
  useEffect(() => {
    if (!open) return undefined;
    function handleKey(event) {
      if (event.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fdr-modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className="fdr-modal">
        <div className="fdr-modal__header">
          <h3 className="fdr-modal__title">{title}</h3>
          <button className="fdr-modal__close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="fdr-modal__body">{children}</div>
        {footer ? <div className="fdr-modal__footer">{footer}</div> : null}
      </div>
    </div>
  );
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "确认",
  cancelLabel = "取消",
  danger = false,
  onConfirm,
  onClose,
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={() => {
              onConfirm?.();
              onClose?.();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 14, color: "var(--text)" }}>{message}</p>
    </Modal>
  );
}
