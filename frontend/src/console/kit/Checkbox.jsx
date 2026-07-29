import { useEffect, useId, useRef } from "react";

export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
  indeterminate = false,
  id,
  className = "",
  ...rest
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <label className={["fdr-check-row", className].filter(Boolean).join(" ")} htmlFor={inputId}>
      <input
        ref={inputRef}
        type="checkbox"
        id={inputId}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        {...rest}
      />
      {label}
    </label>
  );
}
