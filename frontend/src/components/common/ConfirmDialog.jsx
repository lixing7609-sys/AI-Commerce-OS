import { useEffect, useRef } from "react";

/**
 * 轻量通用确认弹窗：遮罩层 + 标题 + 正文 + 可选原因输入框 + 取消/确认。
 *
 * 不使用 window.confirm/prompt/alert；操作进行中（loading=true）
 * 时禁止通过 Escape 或点击遮罩关闭，避免中途打断正在进行的请求。
 */
function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "确认",
  cancelLabel = "取消",
  onConfirm,
  onCancel,
  loading = false,
  danger = false,
  showReasonInput = false,
  reasonValue = "",
  onReasonChange,
  reasonMaxLength = 500,
  reasonPlaceholder = "请输入原因",
  confirmDisabled = false,
}) {
  const confirmButtonRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    confirmButtonRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape" && !loading) {
        onCancel();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, loading, onCancel]);

  if (!open) {
    return null;
  }

  function handleOverlayClick() {
    if (!loading) {
      onCancel();
    }
  }

  return (
    <div className="confirm-dialog-overlay" onClick={handleOverlayClick}>
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="confirm-dialog-title">{title}</h3>

        <p className="confirm-dialog-message">{message}</p>

        {showReasonInput && (
          <div className="confirm-dialog-field">
            <textarea
              className="confirm-dialog-textarea"
              value={reasonValue}
              onChange={(event) => onReasonChange(event.target.value)}
              maxLength={reasonMaxLength}
              rows={4}
              disabled={loading}
              placeholder={reasonPlaceholder}
            />

            <div className="confirm-dialog-char-count">
              {reasonValue.length}/{reasonMaxLength}
            </div>
          </div>
        )}

        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="confirm-dialog-button cancel"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            ref={confirmButtonRef}
            className={`confirm-dialog-button confirm${danger ? " danger" : ""}`}
            onClick={onConfirm}
            disabled={loading || confirmDisabled}
          >
            {loading ? "处理中…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
