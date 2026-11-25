import type { CsvLayout } from "./csv.ts";
import type { Valuation } from "./analytics.ts";

export const valuations: Valuation[] = [
  { date: "2026-01-03", yen: 1000000 },
  { date: "2026-01-10", yen: 1230000 },
  { date: "2026-01-17", yen: 1180000 },
  { date: "2026-01-24", yen: 1180800 }
];
export const coverage = { start: "2026-01-03", end: "2026-01-24" };

export const layout: CsvLayout = {
  date: "反映日", description: "摘要", deposit: "入金額", withdrawal: "出金額",
  effectiveDate: text => text,
  classify(description, direction) {
    if (["配当", "税", "口座内振替"].includes(description)) return "internal";
    return direction;
  }
};

export const sampleCsv = [
  "反映日,摘要,入金額,出金額",
  "2026-01-03,外部入金,100000,",
  '2026-01-08,外部入金,"200,000",',
  "2026-01-15,外部出金,,50000",
  "2026-01-22,配当,1000,",
  "2026-01-23,税,,200"
].join("\n");
