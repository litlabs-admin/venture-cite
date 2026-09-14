import { Button } from "@/components/ui/button";
import { V2Icon } from "@/v2/theme/V2Icon";
import { cn } from "@/lib/utils";
import { v2FocusRing } from "./shared";

export type PaginationProps = {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  className?: string;
};

export function Pagination({ page, pageCount, onPageChange, className }: PaginationProps) {
  const safePage = Math.min(Math.max(1, page), Math.max(1, pageCount));
  const safePageCount = Math.max(1, pageCount);

  return (
    <nav aria-label="Pagination" className={cn("flex items-center justify-end gap-1", className)}>
      <Button
        aria-label="Previous page"
        className={cn(
          "h-8 w-8 p-0 text-[color:var(--v2-ink2)] hover:bg-[var(--v2-inset)] hover:text-[color:var(--v2-ink)]",
          v2FocusRing,
        )}
        disabled={safePage === 1}
        onClick={() => onPageChange(safePage - 1)}
        size="icon"
        type="button"
        variant="ghost"
      >
        <V2Icon name="chev" size={14} className="rotate-180" />
      </Button>
      {Array.from({ length: safePageCount }, (_, index) => index + 1).map((pageNumber) => (
        <Button
          aria-current={pageNumber === safePage ? "page" : undefined}
          aria-label={`Go to page ${pageNumber}`}
          className={cn(
            "h-8 min-w-8 px-2 text-[12px] text-[color:var(--v2-ink2)] hover:bg-[var(--v2-inset)] hover:text-[color:var(--v2-ink)]",
            pageNumber === safePage &&
              "bg-[var(--v2-brand-soft)] text-[color:var(--v2-brand)] hover:bg-[var(--v2-brand-soft)] hover:text-[color:var(--v2-brand)]",
            v2FocusRing,
          )}
          key={pageNumber}
          onClick={() => onPageChange(pageNumber)}
          size="sm"
          type="button"
          variant="ghost"
        >
          {pageNumber}
        </Button>
      ))}
      <Button
        aria-label="Next page"
        className={cn(
          "h-8 w-8 p-0 text-[color:var(--v2-ink2)] hover:bg-[var(--v2-inset)] hover:text-[color:var(--v2-ink)]",
          v2FocusRing,
        )}
        disabled={safePage === safePageCount}
        onClick={() => onPageChange(safePage + 1)}
        size="icon"
        type="button"
        variant="ghost"
      >
        <V2Icon name="chev" size={14} />
      </Button>
    </nav>
  );
}
