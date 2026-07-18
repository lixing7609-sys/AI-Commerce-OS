function AutoResumeToggle({ checked, disabled = false, loading = false, onChange }) {
  function handleChange(event) {
    if (disabled) {
      return;
    }

    onChange(event.target.checked);
  }

  return (
    <label className={`runtime-toggle${disabled ? " disabled" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={handleChange}
      />

      <span className="runtime-toggle-track">
        <span className="runtime-toggle-thumb" />
      </span>

      <span className="runtime-toggle-label">
        {loading ? "更新中…" : checked ? "已开启" : "已关闭"}
      </span>
    </label>
  );
}

export default AutoResumeToggle;
