import { useId } from "react";
import { Icon } from "./Icon.jsx";
import { IconButton } from "./IconButton.jsx";

export function SearchField({
  label,
  value,
  onChange,
  placeholder = "搜索",
  id,
  className = "",
  ...rest
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const wrapClasses = ["fdr-input-wrap", className].filter(Boolean).join(" ");

  return (
    <div className="fdr-field">
      {label ? (
        <label className="fdr-field__label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <div className={wrapClasses}>
        <span className="fdr-input-wrap__icon">
          <Icon name="Search" size={16} />
        </span>
        <input
          id={inputId}
          type="search"
          className="fdr-input"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange?.(event.target.value)}
          {...rest}
        />
        {value ? (
          <IconButton
            icon="X"
            size={14}
            variant="subtle"
            aria-label="清除搜索"
            style={{ position: "absolute", right: 4 }}
            onClick={() => onChange?.("")}
          />
        ) : null}
      </div>
    </div>
  );
}
