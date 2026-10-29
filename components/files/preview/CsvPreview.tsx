"use client";

import { useMemo } from "react";
import { usePreviewText } from "@/hooks/usePreviewText";
import { PreviewError, PreviewSkeleton } from "./PreviewStates";

const MAX_ROWS = 500;
const MAX_COLUMNS = 40;

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (inQuotes) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      inQuotes = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => cell.trim().length > 0));
}

export function CsvPreview({ url }: { url: string }) {
  const { text, loading, error } = usePreviewText(url);
  const rows = useMemo(() => parseCsv(text), [text]);

  if (loading) return <PreviewSkeleton label="Parsing CSV..." />;
  if (error) return <PreviewError href={url} message={error} />;
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-6 py-12 text-center text-sm text-slate-500">
        This CSV file is empty.
      </div>
    );
  }

  const header = rows[0].slice(0, MAX_COLUMNS);
  const body = rows.slice(1, MAX_ROWS + 1).map((cells) => cells.slice(0, MAX_COLUMNS));
  const truncated = rows.length - 1 > MAX_ROWS || rows.some((cells) => cells.length > MAX_COLUMNS);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02]">
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-2.5 text-xs text-slate-500">
        <span>{Math.max(0, rows.length - 1).toLocaleString()} rows · {header.length} columns</span>
        {truncated ? <span className="text-amber-200/80">Showing the first {MAX_ROWS} rows and {MAX_COLUMNS} columns</span> : null}
      </div>
      <div className="max-h-[72vh] overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-[#0d1422]">
            <tr>
              {header.map((cell, index) => (
                <th className="whitespace-nowrap border border-white/10 px-3 py-2 text-left font-semibold text-white" key={index}>
                  {cell || `Column ${index + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((cells, rowIndex) => (
              <tr className={rowIndex % 2 ? "bg-white/[0.015]" : undefined} key={rowIndex}>
                {header.map((_, cellIndex) => (
                  <td className="whitespace-nowrap border border-white/8 px-3 py-2 text-slate-300" key={cellIndex}>
                    {cells[cellIndex] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
