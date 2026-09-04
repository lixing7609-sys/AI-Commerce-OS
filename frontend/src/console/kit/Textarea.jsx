import { useId } from "react";

export function Textarea({
  label,
  value,
  onChange,
  error,
  id,
  className = "",
  ...rest
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const errorId = `${inputId}-error`;

  const classes = ["fdr-textarea", error ? "fdr-textarea--error" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="fdr-field">
      {label ? (
        <label className="fdr-field__label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <textarea
        id={inputId}
        className={classes}
        value={value}
        onChange={onChange}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? errorId : undefined}
        {...rest}
      />
      {error ? (
        <p className="fdr-field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
