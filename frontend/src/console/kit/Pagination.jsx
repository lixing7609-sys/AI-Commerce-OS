import { IconButton } from "./IconButton.jsx";

export function Pagination({ page, pageCount, onChange }) {
  return (
    <nav aria-label="Pagination">
      <div className="fdr-pagination">
        <IconButton
          icon="ChevronLeft"
          aria-label="上一页"
          disabled={page <= 1}
          onClick={() => onChange?.(page - 1)}
        />
        <span>
          {page} / {pageCount}
        </span>
        <IconButton
          icon="ChevronRight"
          aria-label="下一页"
          disabled={page >= pageCount}
          onClick={() => onChange?.(page + 1)}
        />
      </div>
    </nav>
  );
}
