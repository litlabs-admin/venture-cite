import type { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { v2FocusRing, renderValue } from "./shared";

export type DataColumn<T> = {
  key: keyof T;
  header: ReactNode;
  align?: "left" | "center" | "right";
  numeric?: boolean;
  wrap?: boolean;
  className?: string;
  render?: (row: T, rowIndex: number) => ReactNode;
};

export type DataTableProps<T> = {
  columns: readonly DataColumn<T>[];
  rows: readonly T[];
  rowKey?: (row: T, rowIndex: number) => string | number;
  onRowClick?: (row: T, rowIndex: number) => void;
  groupHeader?: (row: T, rowIndex: number) => ReactNode;
  emptyMessage?: ReactNode;
  loading?: boolean;
  loadingRows?: number;
  footer?: ReactNode;
  className?: string;
};

function cellClass<T>(column: DataColumn<T>, header: boolean): string {
  const alignment = column.numeric
    ? "text-right"
    : column.align === "right"
      ? "text-right"
      : column.align === "center"
        ? "text-center"
        : "text-left";
  return cn(
    alignment,
    column.numeric && "font-mono tabular-nums",
    column.wrap === false && "whitespace-nowrap",
    header
      ? "px-3 pb-2 pt-0 text-[11.5px] leading-[1.35] font-semibold uppercase tracking-[0.05em] text-[color:var(--v2-ink3)]"
      : "px-3 py-3 text-[13px] leading-[1.45] text-[color:var(--v2-ink2)]",
    column.className,
  );
}

export function DataTable<T>({
  columns,
  rows,
  rowKey = (_row, rowIndex) => rowIndex,
  onRowClick,
  groupHeader,
  emptyMessage = "No data available.",
  loading = false,
  loadingRows = 3,
  footer,
  className,
}: DataTableProps<T>) {
  const placeholderCount = Math.max(1, loadingRows);
  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <Table className="border-collapse text-[13px] text-[color:var(--v2-ink2)]">
        <TableHeader className="border-b border-[var(--v2-line)]">
          <TableRow className="border-0 hover:bg-transparent">
            {columns.map((column) => (
              <TableHead className={cellClass(column, true)} key={String(column.key)}>
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: placeholderCount }, (_, index) => (
              <TableRow
                className="border-b border-[var(--v2-line)] hover:bg-transparent"
                key={`loading-${index}`}
              >
                <TableCell
                  className="px-3 py-3 text-[color:var(--v2-ink3)]"
                  colSpan={Math.max(1, columns.length)}
                >
                  <span aria-label="Loading">Loading</span>
                </TableCell>
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow className="border-b border-[var(--v2-line)] hover:bg-transparent">
              <TableCell
                className="px-3 py-6 text-center text-[color:var(--v2-ink3)]"
                colSpan={Math.max(1, columns.length)}
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            rows.flatMap((row, rowIndex) => {
              const group = groupHeader?.(row, rowIndex);
              const rowElement = (
                <TableRow
                  className={cn(
                    "border-b border-[var(--v2-line)] hover:bg-[var(--v2-inset)]",
                    onRowClick && cn("cursor-pointer", v2FocusRing),
                  )}
                  key={rowKey(row, rowIndex)}
                  onClick={onRowClick ? () => onRowClick(row, rowIndex) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onRowClick(row, rowIndex);
                          }
                        }
                      : undefined
                  }
                  role={onRowClick ? "button" : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                >
                  {columns.map((column) => (
                    <TableCell className={cellClass(column, false)} key={String(column.key)}>
                      {column.render ? column.render(row, rowIndex) : renderValue(row[column.key])}
                    </TableCell>
                  ))}
                </TableRow>
              );
              return group
                ? [
                    <TableRow
                      className="border-b border-[var(--v2-line)] bg-[var(--v2-inset)] hover:bg-[var(--v2-inset)]"
                      key={`group-${rowIndex}`}
                    >
                      <TableCell
                        className="px-3 py-2 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-[color:var(--v2-ink3)]"
                        colSpan={Math.max(1, columns.length)}
                      >
                        {group}
                      </TableCell>
                    </TableRow>,
                    rowElement,
                  ]
                : [rowElement];
            })
          )}
        </TableBody>
        {footer ? (
          <TableFooter className="border-t border-[var(--v2-line)] bg-[var(--v2-paper)]">
            <TableRow className="border-0 hover:bg-transparent">
              <TableCell className="px-3 py-3" colSpan={Math.max(1, columns.length)}>
                {footer}
              </TableCell>
            </TableRow>
          </TableFooter>
        ) : null}
      </Table>
    </div>
  );
}
