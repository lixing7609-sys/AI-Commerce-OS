import { useEffect, useRef, useState } from "react";
import { Popover } from "./Popover.jsx";
import { Icon } from "./Icon.jsx";

export function DropdownMenu({ trigger, items, align = "start" }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const triggerRef = useRef(null);
  const itemRefs = useRef([]);

  const selectableIndexes = items
    .map((item, index) => (item.divider ? -1 : index))
    .filter((index) => index !== -1);

  function close() {
    setOpen(false);
    setActiveIndex(-1);
    triggerRef.current?.focus();
  }

  function toggle() {
    setOpen((value) => {
      const next = !value;
      setActiveIndex(next ? selectableIndexes[0] ?? -1 : -1);
      return next;
    });
  }

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  function handleKeyDown(event) {
    if (!selectableIndexes.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const pos = selectableIndexes.indexOf(activeIndex);
      setActiveIndex(selectableIndexes[(pos + 1) % selectableIndexes.length]);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const pos = selectableIndexes.indexOf(activeIndex);
      setActiveIndex(
        selectableIndexes[(pos - 1 + selectableIndexes.length) % selectableIndexes.length]
      );
    } else if (event.key === "Escape") {
      close();
    }
  }

  return (
    <Popover
      open={open}
      onClose={close}
      align={align}
      anchor={
        <span
          ref={triggerRef}
          tabIndex={-1}
          onClick={toggle}
          style={{ display: "inline-block" }}
        >
          {trigger}
        </span>
      }
    >
      <div role="menu" onKeyDown={handleKeyDown}>
        {items.map((item, index) =>
          item.divider ? (
            <hr key={`divider-${index}`} className="fdr-divider" />
          ) : (
            <button
              key={item.label ?? index}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              role="menuitem"
              type="button"
              disabled={item.disabled}
              className={[
                "fdr-menu-item",
                item.danger ? "fdr-menu-item--danger" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                item.onClick?.();
                close();
              }}
            >
              {item.icon ? <Icon name={item.icon} size={16} /> : null}
              {item.label}
            </button>
          )
        )}
      </div>
    </Popover>
  );
}
