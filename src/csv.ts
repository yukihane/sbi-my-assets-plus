import { parse } from "csv-parse/browser/esm/sync";
import type { Flow, FlowKind } from "./analytics.ts";

export function decodeCsv(bytes: ArrayBuffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("shift_jis", { fatal: true }).decode(bytes);
  }
}

// The confirmed SBI layout can supply different labels and date normalization.
export interface CsvLayout {
  date: string;
  description: string;
  deposit: string;
  withdrawal: string;
  effectiveDate: (text: string) => string;
  classify: (description: string, direction: "deposit" | "withdrawal") => FlowKind;
}

export function yen(cell: string): number | null {
  if (!cell) return null;
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(cell)) throw new Error();
  const value = Number(cell.replaceAll(",", ""));
  if (!Number.isSafeInteger(value)) throw new Error();
  return value;
}

export function csvRows(csv: string): string[][] {
  try {
    return parse(csv, { bom: true, skip_empty_lines: true, relax_column_count: true, trim: true });
  } catch {
    throw new Error("CSVの引用符または区切り文字を確認してください。");
  }
}

export function readFlows(csv: string, layout: CsvLayout): Flow[] {
  const rows = csvRows(csv);
  const required = [layout.date, layout.description, layout.deposit, layout.withdrawal];
  const index = rows.findIndex(row => required.every(label => row.includes(label)));
  if (index < 0) throw new Error("CSVに必要な見出しがありません。");
  const header = rows[index];
  if (required.some(label => header.indexOf(label) !== header.lastIndexOf(label))) {
    throw new Error("CSVの見出しが重複しています。");
  }
  const [date, description, deposit, withdrawal] = required.map(label => header.indexOf(label));
  return rows.slice(index + 1).map((row, offset) => {
    try {
      if (row.length !== header.length) throw new Error();
      const incoming = yen(row[deposit]);
      const outgoing = yen(row[withdrawal]);
      if ((incoming === null) === (outgoing === null)) throw new Error();
      const direction = incoming === null ? "withdrawal" : "deposit";
      return {
        date: layout.effectiveDate(row[date]),
        yen: incoming ?? outgoing!,
        kind: layout.classify(row[description], direction)
      };
    } catch {
      throw new Error(`CSVの${index + offset + 2}レコード目の日付・金額・列数を確認してください。`);
    }
  });
}
