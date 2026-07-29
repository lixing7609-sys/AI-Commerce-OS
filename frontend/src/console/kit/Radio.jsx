import { useId } from "react";

export function Radio({
  label,
  checked,
  onChange,
  disabled,
  id,
  className = "",
  ...rest
}) {
  const generatedId = useId();
  const inputId = id || generatedId;

  return (
    <label className={["fdr-check-row", className].filter(Boolean).join(" ")} htmlFor={inputId}>
      <input
        type="radio"
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
