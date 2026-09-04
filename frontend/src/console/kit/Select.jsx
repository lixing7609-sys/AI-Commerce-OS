import { useId } from "react";

export function Select({
  label,
  value,
  onChange,
  options = [],
  error,
  id,
  className = "",
  ...rest
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const errorId = `${inputId}-error`;

  const classes = ["fdr-select", error ? "fdr-select--error" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="fdr-field">
      {label ? (
        <label className="fdr-field__label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <select
        id={inputId}
        className={classes}
        value={value}
        onChange={onChange}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? errorId : undefined}
        {...rest}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <p className="fdr-field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
