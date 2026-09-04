import { useId } from "react";
import { Icon } from "./Icon.jsx";

export function Input({
  label,
  value,
  onChange,
  error,
  icon,
  size = "md",
  id,
  className = "",
  ...rest
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const errorId = `${inputId}-error`;

  const inputClasses = [
    "fdr-input",
    error ? "fdr-input--error" : "",
    size === "lg" ? "fdr-input--lg" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const input = (
    <input
      id={inputId}
      className={inputClasses}
      value={value}
      onChange={onChange}
      aria-invalid={error ? "true" : undefined}
      aria-describedby={error ? errorId : undefined}
      {...rest}
    />
  );

  return (
    <div className="fdr-field">
      {label ? (
        <label className="fdr-field__label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      {icon ? (
        <div className="fdr-input-wrap">
          <span className="fdr-input-wrap__icon">
            <Icon name={icon} size={16} />
          </span>
          {input}
        </div>
      ) : (
        input
      )}
      {error ? (
        <p className="fdr-field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
