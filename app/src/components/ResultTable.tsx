import type { Cell } from "@/lib/artifact";

export function ResultTable({
  columns,
  rows,
  maxRows,
}: {
  columns: string[];
  rows: Cell[][];
  maxRows: number;
}) {
  const shown = rows.slice(0, maxRows);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[12px]">
        <thead>
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={col}
                className="whitespace-nowrap px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-text-subtle"
              >
                {col.replace(/_/g, " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="tabular max-w-[280px] truncate whitespace-nowrap px-3 py-1.5 text-text">
                  {cell === null ? "-" : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > maxRows ? (
        <p className="px-3 py-1.5 text-[11px] text-text-subtle">
          Showing {maxRows} of {rows.length} rows
        </p>
      ) : null}
    </div>
  );
}
