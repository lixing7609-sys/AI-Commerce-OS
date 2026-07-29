import { useMemo, useState } from "react";
import { Modal } from "./Modal.jsx";
import { Icon } from "./Icon.jsx";

export function CommandPalette({ open, onClose, groups }) {
  return (
    <Modal open={open} title="命令面板" onClose={onClose}>
      {open ? <CommandPaletteBody groups={groups} onClose={onClose} /> : null}
    </Modal>
  );
}

function CommandPaletteBody({ groups, onClose }) {
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = (groups || []).reduce(
      (acc, group) => {
        const items = group.items.filter((item) => item.label.toLowerCase().includes(q));
        if (!items.length) return acc;
        const indexed = items.map((item, i) => ({ ...item, flatIndex: acc.count + i }));
        return { list: [...acc.list, { ...group, items: indexed }], count: acc.count + items.length };
      },
      { list: [], count: 0 }
    );
    return result.list;
  }, [groups, query]);

  const flatItems = useMemo(() => filteredGroups.flatMap((group) => group.items), [filteredGroups]);
  const highlightIndex = flatItems.length ? Math.min(highlighted, flatItems.length - 1) : -1;

  function handleKeyDown(event) {
    if (!flatItems.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((highlightIndex + 1) % flatItems.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((highlightIndex - 1 + flatItems.length) % flatItems.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = flatItems[highlightIndex];
      if (item) {
        item.onSelect?.();
        onClose?.();
      }
    }
  }

  return (
    <div className="fdr-command-palette">
      <input
        autoFocus
        className="fdr-command-palette__input"
        placeholder="搜索命令…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="fdr-command-palette__list" role="listbox">
        {filteredGroups.map((group) => (
          <div key={group.label}>
            <div className="fdr-command-palette__group-label">{group.label}</div>
            {group.items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="option"
                aria-selected={item.flatIndex === highlightIndex}
                className="fdr-menu-item"
                style={
                  item.flatIndex === highlightIndex
                    ? { background: "var(--canvas-subtle)" }
                    : undefined
                }
                onMouseEnter={() => setHighlighted(item.flatIndex)}
                onClick={() => {
                  item.onSelect?.();
                  onClose?.();
                }}
              >
                {item.icon ? <Icon name={item.icon} size={16} /> : null}
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
